# CLI UX

- **Progress**: Prefer quiet success; use stderr for hints when needed.
- **Tables**: Use fixed columns for `list`; avoid wrapping secrets.
- **JSON**: Stable keys; include `error` object on failure when `--json` is set.
- **Help**: Every command implements `--help` via Commander.
