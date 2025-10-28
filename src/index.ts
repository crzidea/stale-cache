/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

type CachedResponse = {
	headers: Record<string, string>;
	body: string;
};

function responseContent(body: string, headers: Record<string, string> = {}) {
	return new Response(body, {
		headers: {
			'cache-control': 'max-age=0',
			...headers,
		},
	});
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		console.log(request.url);
		const params = new URL(request.url).searchParams;
		const url = params.get('url');
		const regex = params.get('regex');
		const ttl = params.get('ttl');
		if (!url) {
			return new Response('Missing url param', { status: 400 });
		}
		const response = await fetch(url);
		let text = await response.text();

		if (regex) {
			const re = new RegExp(regex);
			const matched = re.test(text);
			if (!matched) {
				const cachedString = await env.CACHE_KV.get(url);
				if (cachedString) {
					const cached: CachedResponse = JSON.parse(cachedString);
					return responseContent(cached.body, cached.headers);
				} else {
					return responseContent(text);
				}
			}
		}
		await env.CACHE_KV.put(
			url,
			JSON.stringify({
				headers: response.headers,
				body: text,
			}),
			{
				// At least 60 seconds TTL
				expirationTtl: ttl ? parseInt(ttl) : 60,
			}
		);
		return responseContent(text);
	},
} satisfies ExportedHandler<Env>;
