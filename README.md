# sveltekit-server-islands

Server islands were introduced by [the Astro team](https://astro.build/blog/future-of-astro-server-islands/) as a way to have bits of dynamic server rendered components in a "sea" of static prerendered content. This library is meant to be a userland implementation of server islands for sveltekit.

## Installation

To install this library you can just use your favorite package manager

```bash
pnpm add sveltekit-server-islands
```

## Setup

Once you installed the library you need to setup your project to allow for the library to work properly: firstly you need to include the vite plugin in your vite config

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { islands } from 'sveltekit-server-islands/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), islands()]
});
```

secondly you need to include the server handle in your `hooks.server.ts`

```ts
export { handle } from 'sveltekit-server-islands';
```

P.s. if you already have your own handle you can use `sequence` from `@sveltejs/kit` to concatenate them

```ts
import { sequence } from '@sveltejs/kit/hooks';

import { handle as islands } from 'sveltekit-server-islands';

export const handle = sequence(islands, ({ resolve, event }) => {
	// your handle
	return resolve(event);
});
```

Finally to take full advantage of server islands you should prerender your application so create a root `+layout.ts` and export a `prerender` variable

```ts
export const prerender = true;
```

once you've done this steps you can start authoring your server islands.

## Authoring Server Islands

There's one extra limitation for this plugin to work: you need to put your islands components in a folder inside `/src/islands`

```bash
src/
├── app.css
├── app.d.ts
├── app.html
├── hooks.server.ts
├── islands
│   ├── CartCount.svelte
│   ├── CustomerReviews.svelte
│   ├── RecommendedProducts.svelte
│   └── RoomAvailability.svelte
├── lib
│   ├── AddToCart.svelte
│   ├── Stars.svelte
│   └── index.ts
└── routes
    ├── +layout.svelte
    ├── +layout.ts
    ├── +page.svelte
    └── api
        └── cart
            └── +server.ts
```

Server Islands components are a bit different from normal svelte components because they'll be server rendered and hydrated separately...this means that is very important for them to be able to load their own data. To achieve this you can export a `load` function just like one that you use in sveltekit from the `<script module>`. This function will be invoked and awaited during the server side rendering of the component and, just like a `+page.svelte` you will receive a `data` prop containing whatever you return from the load function.

To make everything as typesafe as possible we expose a type that you can import to type your props and your event. Here's an example of a Server Island.

```svelte
<script lang="ts" module>
	import type { ServerIslandsProps, ServerIslandsEvent } from 'sveltekit-server-islands';

	export function load({ cookies }: ServerIslandEvent) {
		const count = +(cookies.get('cart') ?? '0');
		return { count };
	}
</script>

<script lang="ts">
	let { data }: ServerIslandProps<typeof load> = $props();
</script>

<span class="sr-only">Cart</span>
<span id="cart-count" hidden={data?.count === 0}>{data?.count}</span>
```

Both `ServerIslandsEvent` and `ServerIslandsProps` accept an additional type parameter to specify extra props that you want to accept in the component

```svelte
<script lang="ts" module>
	import type { ServerIslandsProps, ServerIslandsEvent } from 'sveltekit-server-islands';

	export function load({ cookies, props }: ServerIslandEvent<{ name: string }>) {
		const count = +(cookies.get('cart') ?? '0');
		// we have access to the props in the event
		if (props.name === 'root') {
			count++;
		}
		return { count };
	}
</script>

<script lang="ts">
	let { data, name }: ServerIslandProps<typeof load, { name: string }> = $props();
</script>

<span class="sr-only">Cart ({name})</span>
<span id="cart-count" hidden={data?.count === 0}>{data?.count}</span>
```

As you might have spotted this can introduce a bit of duplication, to prevent this we also expose a type `ServerIslands` that you can use to type both the load function and the props

```svelte
<script lang="ts" module>
	import type { ServerIslands } from 'sveltekit-server-islands';

	type MyIslandProps = ServerIslands<typeof load, { name: string }>;

	export function load({ cookies, props }: ServerIsland['event']>) {
		const count = +(cookies.get('cart') ?? '0');
		// we have access to the props in the event
		if(props.name === "root"){
			count++;
		}
		return { count };
	}
</script>

<script lang="ts">
	let { data, name }: ServerIsland['props'] = $props();
</script>

<span class="sr-only">Cart ({name})</span>
<span id="cart-count" hidden={data?.count === 0}>{data?.count}</span>
```

The `ServerIslandsProps` type will also include another important type: a `fallback` snippet. When you use the component you can in-fact provide some markup that will be rendered before the fetch request to server side render the component starts.

```svelte
<script>
	import CartCount from '../islands/CartCount.svelte';
</script>

<CartCount>
	{#snippet fallback()}
		Loading...
	{/snippet}
</CartCount>
```

Note that if you need it you can pass other props to the component (and even update them after the component has been mounted)
