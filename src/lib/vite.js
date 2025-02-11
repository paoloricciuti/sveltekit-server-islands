/**
 * @import { ExportNamedDeclaration, Program } from "acorn";
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build } from 'vite';
import { readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { walk } from 'zimmerframe';
import { print } from 'esrap';

const output_path = '/__islands';
const output_dir = `static${output_path}`;
const dir = join(process.cwd(), '/src/islands');

/**
 * Function used to build the islands components on HMR, on build and on dev...those will be javascript
 * files imported when the island loads to hydrate even when csr is false
 */
async function build_islands() {
	// remove the old dir
	await rm(join(process.cwd(), output_dir), { force: true, recursive: true });
	// read every file in the islands folder
	const islands_dir = (await readdir(dir, { withFileTypes: true })).filter((file) => file.isFile());
	const entry = islands_dir.map((file) => file.name);
	const islands_components = islands_dir.map((file) => join(file.parentPath, file.name));
	build({
		plugins: [
			svelte(),
			{
				name: 'vite-plugin-sveltekit-islands-add-hydrate',
				transform: {
					order: 'post',
					handler(code, id) {
						// we check if this is one of the islands files
						if (islands_components.includes(id)) {
							const ast = this.parse(code);
							// we remove every export named declaration...this has two effects: firstly will treeshake away the load function
							// allowing the user to use server only code from it without it leaking to the client. Furthermore will allow us
							// to add an export to hydrate from the module that will be used on the client to hydrate this component if csr is disabled
							const modified = /** @type {Program} */ (
								/** @type {unknown} */ (
									walk(
										/** @type {ExportNamedDeclaration} */ (/** @type {unknown} */ (ast)),
										{},
										{
											// @ts-ignore
											ExportNamedDeclaration(node) {
												// in case there's a declaration we return that declaration...this is to prevent
												// functions that are exported AND used to be removed completely
												if (node.declaration) {
													return node.declaration;
												}
												return {
													type: 'EmptyStatement',
												};
											},
										},
									)
								)
							);
							// let's push the `export { hydrate } from svelte`
							modified.body.push({
								type: 'ExportNamedDeclaration',
								specifiers: [
									{
										type: 'ExportSpecifier',
										local: {
											type: 'Identifier',
											name: 'hydrate',
											start: 0,
											end: 0,
										},
										exported: {
											type: 'Identifier',
											name: 'hydrate',
											start: 0,
											end: 0,
										},
										start: 0,
										end: 0,
									},
								],
								source: {
									type: 'Literal',
									value: 'svelte',
									start: 0,
									end: 0,
								},
								attributes: [],
								start: 0,
								end: 0,
							});
							return print(ast);
						}
					},
				},
			},
		],
		// we only run the build for the specific folder to avoid vite picking up unwanted files
		root: dir,
		build: {
			lib: {
				formats: ['es'],
				entry,
			},
			rollupOptions: {
				output: {
					dir: output_dir,
				},
			},
		},
	});
}

/**
 * @returns {import("vite").Plugin}
 */
export function islands() {
	return {
		name: 'vite-plugin-sveltekit-islands',
		resolveId(source) {
			if (source === 'virtual:render.svelte') {
				return 'virtual:render.svelte';
			}
		},
		writeBundle: {
			sequential: true,
			handler: () => {
				// build the islands on build
				build_islands();
			},
		},
		async configureServer() {
			// build the islands on dev
			build_islands();
		},
		handleHotUpdate({ file }) {
			// build the islands on an hot update if the updated file is in islands
			if (dirname(file) === dir) {
				build_islands();
			}
		},
		load: {
			order: 'pre',
			handler(id) {
				// companion component to render a snippet in createRawSnippet
				if (id === 'virtual:render.svelte') {
					return `<script>
								let {snippet} =$props();
							</script>
							{@render snippet?.()}`;
				}
				try {
					const url = new URL('file://' + id);
					const [folder, name] = url.pathname.split('/').slice(-2);
					if (
						folder === 'islands' &&
						name.endsWith('.svelte') &&
						!url.searchParams.has('not-island') &&
						url.searchParams.get('type') !== 'style'
					) {
						// this is the "fake component" that we return when the user import the file normally
						// see how it works in the readme for an explanation of the component
						return `<script>
						import Render from 'virtual:render.svelte';
						import { render } from 'svelte/server';
						import { hydrate, createRawSnippet } from 'svelte';
						let all = $props();
						let id = crypto.randomUUID();

						let island;

						const is_land = createRawSnippet((snippet)=>{
							return {
								render(){
									let middle = "";
									if(typeof window==="undefined"){
										middle = render(Render, {props: { snippet: snippet() }}).body;
									}
									return \`<is-land id='\${id}' style='display: contents'>\${middle}</is-land>\`
								},
								setup(element){
									if(element.__loaded == null){
										hydrate(Render, { target: element, props: { snippet: snippet() }});
									}
									island = element;
								}
							}
						});
						const code = \`{
							const island = document.getElementById('\${id}');
							const props = \${JSON.stringify(all)};
							let resolve;
							island.__loaded = new Promise((r)=>{
								resolve = r;
							});
							const ssr = fetch('__island?name=${name.replace('.svelte', '')}', {
								method: 'POST',
								body: JSON.stringify(props),
							}).then((res)=>res.json()).then((html)=>{
								island.innerHTML = html.body;
								if(html.data){
									island.dataset.data = JSON.stringify(html.data);
								}
								resolve();
								return html.data;
							})

							const csr_enabled = [...document.querySelectorAll("script")]
								.findIndex((script_tag)=> script_tag.dataset.island == null && script_tag.innerText.includes('kit.start')) !== -1;

							if(!csr_enabled){
								ssr.then(async (data)=>{	
									const { default: comp, hydrate } = await import('${output_path}/${name.replace('.svelte', '.js')}');
									if(data){
										props["data"] = data;
									}
									hydrate(comp, { target: island, props });
								});
							}
						}\`

						$effect(()=>{
							if(island.__loaded == null){
								new Function(code)();
							}
							import('./${name}?not-island').then(async (module)=>{
								await island.__loaded;
								let props = {};
								for(let key of Object.keys(all)){
									Object.defineProperty(props, key, {
										get(){
											return all[key];
										},
										set(v){
											all[key] = v;
										}
									});
								}
								if(island.dataset?.data){
									props["data"] = JSON.parse(island.dataset.data);
								}
								hydrate(module.default, { target: island, props });
							});
						});
					</script>
					{@render is_land(all.fallback)}
					{@html \`<script data-island>
					\${code}
					</script>\`}
					`;
					}
				} catch {
					/** empty */
				}
			},
		},
	};
}
