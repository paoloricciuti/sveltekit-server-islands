import { json } from '@sveltejs/kit';
import { render } from 'svelte/server';

const components = /**
 * @type {Record<string, ()=>Promise<{ default: import("svelte").Component, load?: (event: import("@sveltejs/kit").RequestEvent)=>unknown}>>}
 */ (
	import.meta.glob('/src/islands/*.svelte', {
		query: '?not-island'
	})
);

const styles = /**
 * @type {Record<string, () => Promise<{ code: string; }>>}
 */ (
	import.meta.glob('/src/islands/*.svelte', {
		query: '?raw&svelte&type=style&not-island'
	})
);

/**
 * @template {(...rest: any[])=>any} [TData=()=>void]
 * @template {Record<string|symbol|number, unknown>} [TRest={}]
 * @typedef {{ fallback?: import("svelte").Snippet<[]>, data?: Awaited<ReturnType<TData>> } & TRest } ServerIslandsProps
 */

/**
 * @template {Record<string|symbol|number, unknown>} [TRest={}]
 * @typedef {import("@sveltejs/kit").ServerLoadEvent & { props: TRest }} ServerIslandsEvent
 */

/**
 * @template {(...rest: any[])=>any} [TData=()=>void]
 * @template {Record<string|symbol|number, unknown>} [TRest={}]
 * @typedef {{ props: ServerIslandsProps<TData, TRest>, event: ServerIslandsEvent<TRest> }} ServerIslands
 */

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	if (event.url.pathname === '/__island') {
		const props = await event.request.json();
		const name = event.url.searchParams.get('name');
		const comp = await components[`/src/islands/${name}.svelte`]();
		const css = await styles[`/src/islands/${name}.svelte`]();
		if (comp.load) {
			// if there's a referer let's use it as the url since it's more correct
			const referer = event.request.headers.get('referer');
			if (referer) {
				const url = new URL(referer);
				Object.defineProperty(event.request, 'url', {
					value: referer,
					enumerable: true,
					configurable: true
				});
				Object.defineProperty(event, 'url', {
					value: url,
					enumerable: true,
					configurable: true
				});
			}
			Object.defineProperty(event, 'props', {
				configurable: true,
				enumerable: true,
				value: props
			});
			Object.defineProperty(event, 'route', {
				get() {
					throw new Error("You can't access the route in a Server Island");
				}
			});
			props.data = await comp.load(event);
		}
		const { body } = render(comp.default, { props });
		return json({
			body: `${body}${css.code ? `<style>${css.code}</style>` : ''}`,
			data: props.data
		});
	}
	return resolve(event);
}
