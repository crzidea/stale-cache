# Developer & Agent Guide: stale-cache

This document provides a comprehensive overview of the `stale-cache` repository, its configuration, coding guidelines, development workflows, and testing procedures. It is designed to help developer agents work safely and effectively in this repository.

---

## 1. Project Overview

`stale-cache` is a proxy and caching service built to run on **Cloudflare Workers** (`workerd` runtime).

### Key Functionality
- **Proxying & Caching**: It intercepts incoming requests, extracts a target upstream URL from the `url` search parameter, fetches it, caches the response (headers, body, and timestamp) in Cloudflare KV storage (`CACHE_KV`), and returns it to the client.
- **Custom TTL**: Clients can pass an optional `ttl` query parameter to define cache expiration (in seconds).
- **Stale-on-Regex-Failure (Fallback Cache)**: If an optional `regex` query parameter is provided, the worker validates the fetched upstream response body against this regular expression. If the response **does not** match the regex, the worker will serve the stale cached response (if available) instead of caching/returning the new non-matching response.

### Runtime Assumptions
- **Runtime Environment**: Cloudflare Workers (`workerd` compatibility date: `2025-10-24`).
- **Storage**: Cloudflare KV namespace bound under `CACHE_KV`.
- **Min TTL Constraint**: A hardcoded minimum TTL of 60 seconds (`MIN_TTL = 60`) is enforced. If a smaller TTL is requested, it defaults to `MIN_TTL`.

---

## 2. Repository Structure

- **[src/](file:///home/crzidea/src/stale-cache/src)**: Main application source code.
  - **[src/index.ts](file:///home/crzidea/src/stale-cache/src/index.ts)**: The entry point of the Cloudflare Worker containing the request handler and caching logic.
- **[test/](file:///home/crzidea/src/stale-cache/test)**: Test suite directories and configs.
  - **[test/index.spec.ts](file:///home/crzidea/src/stale-cache/test/index.spec.ts)**: Vitest spec file containing unit and integration style tests (Note: these are currently boilerplate).
  - **[test/tsconfig.json](file:///home/crzidea/src/stale-cache/test/tsconfig.json)**: TypeScript compiler configuration for tests, extending the base config.
  - **[test/env.d.ts](file:///home/crzidea/src/stale-cache/test/env.d.ts)**: Declares test environment overrides for `cloudflare:test`.
- **[wrangler.jsonc](file:///home/crzidea/src/stale-cache/wrangler.jsonc)**: Cloudflare Wrangler configuration (JSONC format) defining entry point, compatibility date, observability, and KV bindings.
- **[worker-configuration.d.ts](file:///home/crzidea/src/stale-cache/worker-configuration.d.ts)**: Auto-generated TypeScript types representing wrangler-bound environment variables (generated via `wrangler types`).
- **[package.json](file:///home/crzidea/src/stale-cache/package.json)** / **[package-lock.json](file:///home/crzidea/src/stale-cache/package-lock.json)**: npm scripts and package dependencies.
- **[vitest.config.mts](file:///home/crzidea/src/stale-cache/vitest.config.mts)**: Configuration for the Vitest test runner using Cloudflare workers pool.
- **[tsconfig.json](file:///home/crzidea/src/stale-cache/tsconfig.json)**: Root TypeScript compilation configuration.
- **[.prettierrc](file:///home/crzidea/src/stale-cache/.prettierrc)**: Prettier code formatting config.
- **[.editorconfig](file:///home/crzidea/src/stale-cache/.editorconfig)**: Editor configurations.
- **[.vscode/settings.json](file:///home/crzidea/src/stale-cache/.vscode/settings.json)**: VS Code workspace associations.

---

## 3. Development Workflow

### Dependency Installation
To install the required dependencies, run:
```bash
npm install
```

### Local Development Server
To spin up a local development server with Wrangler, run:
```bash
npm run dev
# or
npm run start
```
This serves the worker locally (by default at `http://localhost:8787/`).

### Type Generation
Whenever you modify `wrangler.jsonc` (such as changing, adding, or removing KV namespaces or environment variables), you must regenerate TypeScript type declarations:
```bash
npm run cf-typegen
```
This runs `wrangler types` and writes the outputs directly to `worker-configuration.d.ts`.

### Running Tests
To execute the test suite, run:
```bash
npm run test
```
*Note on test status*: Out-of-the-box, running tests fails because Vitest requires `kv_namespaces[0]` to have an `id` string field (e.g., `"id": "some-local-kv-id"`), which is omitted in the default `wrangler.jsonc`.

### Linting & Formatting
No linting/formatting scripts are pre-defined in `package.json`, but a `.prettierrc` file exists. Coding styles are enforced using Prettier with the following preferences:
- Tabs for indentation (`"useTabs": true`)
- Single quotes (`"singleQuote": true`)
- Semicolons (`"semi": true`)
- Max line/print width: 140 (`"printWidth": 140`)

---

## 4. Coding Conventions

- **Entry Point Pattern**: The worker exports a default object implementing `ExportedHandler<Env>` and verified using the TypeScript `satisfies` operator:
  ```typescript
  export default {
      async fetch(request, env, ctx): Promise<Response> { ... }
  } satisfies ExportedHandler<Env>;
  ```
- **TypeScript Strictness**: Strict type-checking is enabled (`"strict": true` in `tsconfig.json`). Ensure type assertions are avoided where possible and signatures match correctly.
- **Caching Representation**: Cache objects stored in KV must be JSON strings conforming to the following structure:
  ```typescript
  type CachedResponse = {
      headers: Record<string, string>;
      body: string;
      timestamp: number;
  };
  ```
- **Error Handling**: Missing required query parameters must return a 400 Bad Request status code:
  ```typescript
  if (!url) {
      return new Response('Missing url param', { status: 400 });
  }
  ```
- **Logging**: The incoming request URL is logged to stdout using `console.log(request.url)`. Avoid adding excessive logging to production pathways unless requested.

---

## 5. Agent-Specific Instructions

- **Do Not Modify Directly**:
  - `[worker-configuration.d.ts](file:///home/crzidea/src/stale-cache/worker-configuration.d.ts)`: This is auto-generated. Any manual changes will be overwritten. Use `npm run cf-typegen` to update.
- **Critical Care Areas**:
  - `[src/index.ts](file:///home/crzidea/src/stale-cache/src/index.ts)`: Contains the core caching logic. Be extremely careful when editing response headers, regex testing, or KV expiration calculations.
- **Validation Protocol**:
  Before reporting completion on code modifications, perform these checks:
  1. Verify TypeScript compiles without issues: `npx tsc --noEmit`
  2. Regenerate worker types: `npm run cf-typegen`
  3. Ensure no local Git modifications are made to `worker-configuration.d.ts` unless wrangler config has changed.
- **Avoiding Destructive Operations**:
  - Do not delete or rename the `CACHE_KV` binding in `wrangler.jsonc`.
  - Always preserve original comments and docstrings in `src/index.ts`.

---

## 6. Configuration and Environment

- **Bindings**:
  - `CACHE_KV`: Cloudflare KV namespace binding.
- **Environment Variables**:
  - Not documented or defined in the repository.
- **Secrets Management**:
  - Secrets are not documented in the repository files. If secrets are needed, they should be managed via Wrangler Secrets.
- **Ignored Config Files**:
  - `.env` files and `.dev.vars` files are ignored by git (configured in `.gitignore`).

---

## 7. Testing Guidance

- **Test Framework**: Vitest using `@cloudflare/vitest-pool-workers`.
- **Test Location**: All test files are located in `[test/](file:///home/crzidea/src/stale-cache/test)`.
- **Known Test Issues**:
  - **Vitest Configuration Error**: Testing currently fails out-of-the-box with `kv_namespaces[0] bindings should have a string "id" field but got {"binding":"CACHE_KV"}`. To resolve this, you must temporarily add a string `"id"` property (e.g. `"id": "local-id"`) to the KV namespace in `wrangler.jsonc` or mock/stub the KV behavior.
  - **Boilerplate Mismatch**: The existing tests in `[test/index.spec.ts](file:///home/crzidea/src/stale-cache/test/index.spec.ts)` are generated defaults expecting a `"Hello World!"` output and will fail because the worker actually handles proxying cache requests. Agents must rewrite these tests when verifying proxy logic.

---

## 8. Deployment and Releases

- **Build Output**: Output files generated during development or packaging are stored in `.wrangler/` (git-ignored).
- **Deployment command**:
  ```bash
  npm run deploy
  ```
  Deploys the worker to the Cloudflare network using `wrangler deploy`.
- **Release and Versioning Process**:
  - Current version is tracked in `package.json` (`"version": "0.0.0"`).
  - No CI/CD pipelines, release scripts, or automated versioning frameworks are documented in the repository.
