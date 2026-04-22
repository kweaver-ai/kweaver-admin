# Audit, Config, Call

This file focuses on behavior details that are easy to misread from `--help`
alone.

## `audit list`

- `--page <n>`: page number.
- `--size <n>`: page size.
- `--user <name>`: filter by user name.
- `--start <iso>`: ISO8601 start time.
- `--end <iso>`: ISO8601 end time.

Notes:

- login-log backend can be slow on some clusters; CLI includes timeout handling.
- On timeout/termination-style failures, CLI appends a retry/smaller-page hint.

## `config show`

- prints `~/.kweaver-admin/config.json`.
- With `--json`, output also includes config file `path`.

## `config set <key> <value>`

- `<key>` currently supports `baseUrl`.
- `<value>` value to set.
- Empty/missing value is rejected.
- Unknown keys are rejected.

## `call <url> [curl-like flags]` (alias: `curl`)

Typical flags:

- `-X <METHOD>`
- `-H <header>`
- `-d/--data-raw <body>`
- `-F <multipart>`
- `-bd, --biz-domain <value>`: override `x-business-domain`
- `-v` verbose request details
- `--json`: pretty-print response JSON
- `--pretty`: pretty-print JSON output
- `--no-pretty` raw response rendering

Behavior:

- Injects auth token headers when available.
- Works for quick endpoint verification and payload probing.
- `call` is special-cased before Commander parses other commands because it
  accepts curl-style flags.
- `-d/--data/--data-raw` implies `POST` if method was still `GET`.
- `--json` inside `call` is a response formatting flag; it also works as global
  `kweaver-admin --json call ...`.

Use `call` when:

- there is no first-class subcommand yet
- you need to probe raw endpoint reachability/payload shape
- you need to compare platform behavior with documented REST paths

Prefer first-class commands when they exist, because those commands already
embed routing/fallback behavior and friendlier output.
