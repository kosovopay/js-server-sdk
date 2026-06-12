# @kosovopay/server-sdk

## 0.3.0

### Minor Changes

- ac560cd: Add `pay.request()` low-level escape hatch for calling endpoints the typed
  resources don't model yet (same auth, versioning, retries, and idempotency).

  Also fixes two transport edge cases:

  - Caller-initiated aborts are now surfaced as the original abort instead of
    being misreported as a `KosovoPayTimeoutError`, and are never retried.
  - `Retry-After` now honours the HTTP-date form in addition to a seconds value
    (capped at 60s).

  **Minimum runtime is now Node 20** (was Node 18). Node 18 is end-of-life and
  doesn't expose the global Web Crypto / `crypto.randomUUID` the SDK relies on, so
  it was never actually functional there. Bun, Deno, and Cloudflare Workers are
  unaffected.

## 0.2.0

### Minor Changes

- 6b734ea: Initial public release of the KosovoPay server SDK — a type-safe, runtime-agnostic client (Node, Bun, Deno, Cloudflare Workers) with zero dependencies, auto-pagination, idempotent retries, and fully-typed webhooks.
