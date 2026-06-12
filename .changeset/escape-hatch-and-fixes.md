---
"@kosovopay/server-sdk": minor
---

Add `pay.request()` low-level escape hatch for calling endpoints the typed
resources don't model yet (same auth, versioning, retries, and idempotency).

Also fixes two transport edge cases:

- Caller-initiated aborts are now surfaced as the original abort instead of
  being misreported as a `KosovoPayTimeoutError`, and are never retried.
- `Retry-After` now honours the HTTP-date form in addition to a seconds value
  (capped at 60s).
