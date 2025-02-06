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
		load: {
			order: 'pre',
			handler(id) {
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
							let resolve;
							island.__loaded = new Promise((r)=>{
								resolve = r;
							});
							fetch('__island?name=${name.replace('.svelte', '')}', {
								method: 'POST',
								body: '\${JSON.stringify(all)}',
							}).then((res)=>res.json()).then((html)=>{
								island.innerHTML = html.body;
								if(html.data){
									island.dataset.data = JSON.stringify(html.data);
								}
								resolve();
							});
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
					{@html \`<script>
					\${code}
					</script>\`}
					`;
					}
				} catch {
					/** empty */
				}
			}
		}
	};
}
