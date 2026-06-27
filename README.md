# DXFlow

[![npm version](https://img.shields.io/npm/v/dxflow.svg)](https://www.npmjs.com/package/dxflow)
[![license](https://img.shields.io/npm/l/dxflow.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/dxflow.svg)](https://www.npmjs.com/package/dxflow)

A CLI tool for defining multi-step API request scenarios in a YAML/JSON manifest, running them in order while threading response data from one request into the next, and generating timing/correctness reports (console, JSON, HTML).

## Why

Testing a real-world API flow usually means: call endpoint A, grab something from the response, use it in the headers/body of endpoint B, repeat. This tool lets you describe that flow declaratively and get a report out the other end — request/response detail, per-step timing, pass/fail against expectations, and aggregate stats (slowest step, average duration, etc).

## Install

```bash
npm install -g dxflow
dxflow run scenario.yaml
```

Or run it without a global install, via `npx` (the package name is `dx-flow`, the command it installs is `dxflow`):

```bash
npx dxflow run scenario.yaml
```

To use it as a library in your own Node project instead:

```bash
npm install dxflow
```

(See [Programmatic API](#programmatic-api) below.)

## Usage

```bash
dxflow run scenario.yaml [--json report.json] [--html report.html] [--quiet]
```

- `run <manifest>` — required. Path to a `.yaml`, `.yml`, or `.json` manifest.
- `--json <path>` — also write the report as JSON.
- `--html <path>` — also write the report as a self-contained HTML page (table + timing chart).
- `--quiet` — suppress console output (still respects `--json`/`--html`).

Exit code is `0` if every step succeeded, `1` otherwise — convenient for CI.

## Manifest format

```yaml
name: Checkout flow
baseUrl: https://api.example.com   # optional if every step path is absolute
defaultHeaders:                     # merged into every step; step-level headers win
  X-Client: my-test-suite
vars:                               # static values, available as {{vars.x}}
  customerName: Ada Lovelace

steps:
  - id: createUser                  # must be unique, used to reference this step later
    name: Create user account       # optional, friendlier label in reports
    method: POST
    path: /users
    body:
      name: "{{vars.customerName}}"
    expect:
      status: 201                   # or a list: status: [200, 201]

  - id: createOrder
    method: POST
    path: /orders
    headers:
      Authorization: "Bearer {{steps.createUser.body.token}}"
    body:
      userId: "{{steps.createUser.body.id}}"
    expect:
      status: 201
      bodyContains:
        status: created

  - id: confirmOrder
    method: GET
    path: /orders/placeholder        # overridden by the transform below
    transform: ./transforms/confirm-order.mjs#buildConfirmRequest
    expect:
      status: 200
```

### Templating: `{{steps.<id>.<field>}}`

Available under `context.steps.<id>`:

| Field | Meaning |
|---|---|
| `body` | parsed JSON response body (or raw text if not JSON) |
| `status` | HTTP status code |
| `statusText` | HTTP status text |
| `headers` | response headers (lowercased keys) |
| `requestBody` | the body that was actually sent for that step |
| `durationMs` | that step's request duration |

Dot-paths and numeric array indices both work: `{{steps.createUser.body.items.0.id}}`.

A field that is *exactly* one template (e.g. `"{{steps.a.body.id}}"`) keeps its native type (number stays a number). A template embedded in a larger string (e.g. `"Bearer {{steps.a.body.token}}"`) is stringified and interpolated.

`{{vars.x}}` resolves manifest-level `vars`.

### Custom logic: `transform`

For anything templating can't express, point a step at a JS/TS module + export:

```yaml
transform: ./transforms/confirm-order.mjs#buildConfirmRequest
```

```js
// transforms/confirm-order.mjs
export function buildConfirmRequest(ctx) {
  const orderId = ctx.steps.createOrder.body.orderId;
  return {
    path: `/orders/${orderId}`,
    query: { verbose: "true" },
    // method, headers, body can also be overridden here
  };
}
```

The function receives the full run context (`scenarioName`, `baseUrl`, `vars`, `steps`) and returns an object overriding any of `method`, `path`, `headers`, `query`, `body`. Anything it doesn't return falls back to the step's templated values. The path is resolved relative to the manifest file.

### Other step options

- `query` — string-to-string map, supports templating, same as headers/body.
- `delayMs` — wait this many ms before sending the request.
- `timeoutMs` — per-step request timeout (default 30000).
- `continueOnFailure: true` — don't halt the scenario if this step fails (request error or failed expectation). By default, the first failure stops the run.

## Programmatic API

Everything is also exported from the package root for use as a library:

```ts
import { loadManifest, runScenario, renderHtmlReport } from "dx-flow";

const manifest = await loadManifest("./scenario.yaml");
const report = await runScenario(manifest, { manifestPath: "./scenario.yaml" });
console.log(report.success, report.summary);
```

## Project layout

```
src/
  manifest/    YAML/JSON loading + zod schema validation
  template/     {{steps.x.body.y}} resolution
  transform/    dynamic import() of "path#exportName" custom step logic
  runner/       HTTP client (fetch + timing), step + scenario orchestration, expectations
  report/       console / JSON / HTML report rendering
  cli.ts        argument parsing + wiring
  index.ts      public programmatic API
```

## Contributing / local development

Clone the repo, then:

```bash
npm install
npm run build             # bundles src/ into dist/ via tsdown
npm test                  # run the full test suite (node:test)
npm run test:watch        # same, in watch mode
npm run test:coverage     # run with --experimental-test-coverage
npm run typecheck         # typecheck src/ (excludes tests)
npm run typecheck:test    # typecheck src/ including *.test.ts
```

Current coverage: ~98.6% lines / ~93.6% branches / ~96.8% functions across `src/` (excluding test files and the build output).

## Publishing (maintainers)

```bash
npm version <patch|minor|major>
npm publish
```

`npm publish` runs `prepublishOnly` automatically, which typechecks (source and tests), runs the full test suite, and rebuilds `dist/` — publishing is blocked if any step fails. Only `dist/`, `examples/`, `README.md`, `LICENSE`, and `package.json` are included in the published tarball (see the `files` field); `src/` and tests are not shipped.

**Before the first publish**, replace the placeholders still in this repo:
- `package.json`: `author`, `repository.url`, `bugs.url`, `homepage`
- `LICENSE`: copyright holder name
- The package name `dx-flow` is currently unclaimed on the npm registry (confirmed at the time this was written) — if you want a different name, update it in `package.json`, the `bin` entry stays `dxflow` independently and doesn't need to match.

You'll also need an npm account and to run `npm login` once before `npm publish` will work.
