import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

type CachedResponse = {
	headers: Record<string, string>;
	body: string;
	timestamp: number;
};

describe('Stale cache proxy worker (KV only)', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('returns 400 when url param is missing', async () => {
		const request = new IncomingRequest('http://localhost:8787/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		expect(await response.text()).toBe('Missing url param');
	});

	it('fetches from origin on cache miss and stores in KV', async () => {
		const targetUrl = 'https://origin-miss.com/data';
		fetchSpy.mockResolvedValue(new Response('hello origin', {
			headers: { 'Content-Type': 'text/plain', 'X-Test': 'abc' }
		}));

		const request = new IncomingRequest(`http://localhost:8787/?url=${encodeURIComponent(targetUrl)}&ttl=60`);
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('hello origin');
		expect(response.headers.get('X-Test')).toBe('abc');

		// Verify stored in KV
		const kvCachedString = await env.CACHE_KV.get(targetUrl);
		expect(kvCachedString).toBeDefined();
		const kvCached: CachedResponse = JSON.parse(kvCachedString!);
		expect(kvCached.body).toBe('hello origin');
		expect(kvCached.headers['x-test']).toBe('abc');
	});

	it('serves from KV cache when fresh without fetching from origin', async () => {
		const targetUrl = 'https://origin-kv-hit.com/data';

		// Populate KV
		const timestamp = Date.now();
		await env.CACHE_KV.put(targetUrl, JSON.stringify({
			body: 'cached in kv',
			headers: { 'Content-Type': 'text/plain' },
			timestamp
		}));

		const request = new IncomingRequest(`http://localhost:8787/?url=${encodeURIComponent(targetUrl)}&ttl=120`);
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('cached in kv');
	});

	it('fetches from origin when KV cache is expired', async () => {
		const targetUrl = 'https://origin-expired.com/data';

		// Populate KV with expired timestamp (100 seconds ago)
		const expiredTimestamp = Date.now() - 100 * 1000;
		await env.CACHE_KV.put(targetUrl, JSON.stringify({
			body: 'expired l2',
			headers: { 'Content-Type': 'text/plain' },
			timestamp: expiredTimestamp
		}));

		// Mock origin fetch
		fetchSpy.mockResolvedValue(new Response('fresh origin response', {
			headers: { 'Content-Type': 'text/plain' }
		}));

		// Request with ttl=60 (which is less than the 100s age)
		const request = new IncomingRequest(`http://localhost:8787/?url=${encodeURIComponent(targetUrl)}&ttl=60`);
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('fresh origin response');
	});

	it('returns stale KV cache fallback on regex match failure', async () => {
		const targetUrl = 'https://origin-regex.com/data';

		// Populate KV cache with stale fallback
		const timestamp = Date.now() - 120 * 1000; // expired
		await env.CACHE_KV.put(targetUrl, JSON.stringify({
			body: 'stale matched content',
			headers: { 'Content-Type': 'text/plain' },
			timestamp
		}));

		// Mock origin fetch to return "invalid response" (doesn't match regex "matched")
		fetchSpy.mockResolvedValue(new Response('invalid response', {
			headers: { 'Content-Type': 'text/plain' }
		}));

		const request = new IncomingRequest(
			`http://localhost:8787/?url=${encodeURIComponent(targetUrl)}&ttl=60&regex=${encodeURIComponent('matched')}`
		);
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('stale matched content');
	});
});
