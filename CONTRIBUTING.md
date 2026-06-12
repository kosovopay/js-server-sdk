# Contributing

Thanks for helping improve the KosovoPay server SDK.

## Prerequisites

This repo uses [Bun](https://bun.sh). Install dependencies with:

```bash
bun install
```

## Workflow

```bash
bun run typecheck   # tsc --noEmit
bun test            # unit tests (bun:test)
bun run lint        # Biome lint + format check
bun run format      # auto-fix formatting
bun run build       # emit dist/ (tsc + .d.ts specifier fix)
```

Run `bun run ci` to do typecheck + lint + tests in one go, the same checks CI runs.

## Cross-runtime

The SDK's promise is that it runs unchanged on Node, Bun, Deno, and Cloudflare
Workers. Keep that intact:

- Build only on **web standards** — `fetch`, `AbortController`, Web Crypto
  (`crypto.subtle`), `TextEncoder`/`TextDecoder`.
- **No `node:` imports**, no `require`, no Node-only globals. CI greps the build
  output to enforce this and runs a smoke test (`scripts/smoke.mjs`) on Node,
  Deno, and Bun.

## Changesets

User-facing changes need a changeset so they get a version bump and a changelog
entry:

```bash
bun run changeset
```

Pick `patch` / `minor` / `major`, write a one-line summary, and commit the file
under `.changeset/`. Releases publish automatically when the "Version Packages"
PR merges — see [`RELEASING.md`](./RELEASING.md).

## Pull requests

- Keep PRs focused; one logical change each.
- Add or update tests for behaviour you change.
- Make sure `bun run ci` is green and a changeset is included (unless the change
  is docs/CI-only).
