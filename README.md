# kweaver-admin

CLI for KWeaver administrators: users, roles, audit, models, and local config. See [AGENTS.md](AGENTS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Requirements

- Node.js 18+

## Quick start

```bash
npm install
npm run build
node dist/index.js --help
```

Global options: `--json`, `--base-url <url>`.

## Auth

Set `KWEAVER_BASE_URL` (or `BASE_URL` via `kweaver-admin config set baseUrl <url>`) and `KWEAVER_TOKEN`, or place a token in `~/.kweaver/token` when aligned with the KWeaver CLI.

## Docs

Product and design documentation live under [docs/](docs/).

## License

Apache-2.0 — see [LICENSE](LICENSE).
