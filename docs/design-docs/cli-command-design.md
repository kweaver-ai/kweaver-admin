# CLI command design

## Naming

- Top-level nouns: `auth`, `org`, `user`, `role`, `llm`, `small-model`, `audit`, `config`.
- Verbs: `list`, `get`, `create`, `update`, `delete`, `assign`, `revoke` as appropriate.

## Output

- Default: human-readable plain aligned columns or short lines (no boxed table border).
- `--json`: one JSON object per line or a single JSON object per command (document per command).

## Global flags

- `--json` — Machine-readable output
- `--base-url` — Override base URL (optional; see `config`)

## Exit codes

- `0` — Success
- `1` — User error (bad args, missing auth)
- `2` — Remote error (HTTP 4xx/5xx) or unexpected failure
