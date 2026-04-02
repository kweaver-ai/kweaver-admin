# Reliability

- Use timeouts on `fetch` once wired (configurable).
- Retry only for idempotent GETs and transient network errors; document policy.
- Surface HTTP status and request id from `x-request-id` when present.
