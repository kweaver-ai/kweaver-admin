# kweaver-admin

English | [中文](README.zh.md)

CLI for KWeaver platform administrators: authentication, org/departments, users, roles, models, audit, arbitrary HTTP (`call`), and local config. See [ARCHITECTURE.md](ARCHITECTURE.md) for the command tree and [docs/SECURITY.md](docs/SECURITY.md) for tokens.

## Requirements

- **Node.js 18+**

## Install (global)

Install the published package so the `kweaver-admin` command is on your `PATH`:

```bash
npm install -g @kweaver-ai/kweaver-admin
```

Verify:

```bash
kweaver-admin --version
kweaver-admin --help
```

**Note:** The package ships the compiled `dist/` entry from npm; you do not need to clone the repo for normal use.

### Alternative: pnpm / yarn

```bash
pnpm add -g @kweaver-ai/kweaver-admin
# or
yarn global add @kweaver-ai/kweaver-admin
```

## Install the Agent Skill

To install this repository's `kweaver-admin` skill into your local skills
runtime:

```bash
npx skills add https://github.com/kweaver-ai/kweaver-admin --skill kweaver-admin
```

After installation, use the skill from your agent workflow where skill loading
is supported.

### Develop from source

```bash
git clone https://github.com/kweaver-ai/kweaver-admin.git
cd kweaver-admin
npm install
npm run build
node dist/index.js --help
# optional: npm link  →  kweaver-admin on PATH
```

## Authentication

1. **Interactive (recommended):** point at your platform base URL and sign in (browser or paste-code flow):

   ```bash
   kweaver-admin auth login https://your-platform.example/
   ```

2. **Headless / CI:** set environment variables (names align with common KWeaver tooling):

   - `KWEAVER_BASE_URL` — platform API base URL  
   - `KWEAVER_TOKEN` or `KWEAVER_ADMIN_TOKEN` — bearer access token  

3. **Persisted config:** `kweaver-admin config set baseUrl <url>` stores defaults under `~/.kweaver-admin/`. Tokens from `auth login` are stored per platform there as well.

Check session:

```bash
kweaver-admin auth status
kweaver-admin auth whoami
```

`auth whoami` precedence:

- explicit `auth whoami <url>`
- env pair `KWEAVER_BASE_URL` + `KWEAVER_TOKEN` / `KWEAVER_ADMIN_TOKEN`
- saved local `currentPlatform`

## Global options

These apply before the subcommand (and work with `call` / `curl` where documented):

| Option | Purpose |
|--------|---------|
| `--json` | Machine-readable JSON output for supported commands |
| `--base-url <url>` | Override API base URL for this run |
| `-k`, `--insecure` | Skip TLS verification (dev only; unsafe) |

Examples:

```bash
kweaver-admin --json org list
kweaver-admin --base-url https://other.example/ user list
```

## Command reference (all subcommands)

Run `kweaver-admin <group> --help` for full flags and examples.

### `auth`

- `auth login [url]` — Log in to platform (browser OAuth2 by default; `--token` and headless/password flows are available).
- `auth logout` — Remove stored token for the current platform.
- `auth status` — Show base URL, token source, TLS mode, and session status.
- `auth whoami [url]` — Decode current identity from saved `id_token`.
- `auth change-password [url]` — Change password through EACP endpoint. With an active session, `-u/--account` defaults to the logged-in admin (self-change); old/new passwords are prompted on TTY if omitted. The forgot-password / vcode flow is intentionally not supported — use the web console for password recovery.
- `auth token` — Print current token to stdout (sensitive output).

### `org`

- `org list` — List departments in pages (`--name`, `--offset`, `--limit`).
- `org tree` — Print department hierarchy as a text tree.
- `org get <id>` — Show full JSON for one department.
- `org create` — Create a department via ISFWeb `Usrm_AddDepartment` thrift path.
- `org update <id>` — Update a department via ISFWeb `Usrm_EditDepartment` thrift path.
- `org delete <id>` — Remove a department via management API.
- `org members <id>` — List members under a department (`--fields` = `users`/`departments`/`users,departments`).

`org` commands usually require `--role` (for example `super_admin`, `org_manager`, `normal_user`) matching your real account permissions.

### `user`

- `user list` — Search/list users (`--org`, `--keyword`, `--offset`, `--limit`).
- `user get <id>` — Get user detail by id.
- `user create` — Create user via ISFWeb `Usrm_AddUser` thrift path.
- `user update <id>` — Update mutable user fields (REST patch when available; fallback to ISFWeb edit thrift).
- `user delete <id>` — Delete user.
- `user roles <id>` — List roles assigned to user.
- `user assign-role <userId> <roleId>` — Assign existing role to user.
- `user reset-password` — Admin reset password (supports prompt/default/confirmation options).
- `user revoke-role <userId> <roleId>` — Revoke role from user.

### `role`

- `role list` — List roles (filter by source/keyword/pagination).
- `role get <id>` — Show role details (resource scopes and operations).
- `role members <roleId>` — List members of role.
- `role add-member <roleId>` — Add one or more members to role.
- `role remove-member <roleId>` — Remove one or more members from role.

### `llm`

- `llm list` — List LLM model configs.
- `llm get <modelId>` — Get one LLM model config.
- `llm add` — Add LLM model config.
- `llm edit <modelId>` — Edit LLM model config.
- `llm delete <modelId...>` — Delete one or multiple LLM models.
- `llm test <modelId>` — Test LLM model connectivity.

### `small-model`

- `small-model list` — List small model configs.
- `small-model get <modelId>` — Get one small model config.
- `small-model add` — Add small model config.
- `small-model edit <modelId>` — Edit small model config.
- `small-model delete <modelId...>` — Delete one or multiple small models.
- `small-model test <modelId>` — Test small model connectivity.

### `audit`

- `audit list` — List login audit events (`--user`, `--start`, `--end`, pagination).

### `config`

- `config show` — Show current `~/.kweaver-admin/config.json`.
- `config set <key> <value>` — Set config value (currently supports `baseUrl`).

### `call` / `curl`

- `call <url> ...flags` — Send authenticated raw HTTP request with curl-style flags (`-X`, `-H`, `-d`, `-F`, `-v`, `-bd`, `--pretty`).
- `curl <url> ...flags` — Alias of `call`.
- Also supports global-style form: `kweaver-admin --json call ...`.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — modules and command tree  
- [AGENTS.md](AGENTS.md) — contributor / agent workflow  
- [docs/](docs/) — product specs and security  

## License

Apache-2.0 — see [LICENSE](LICENSE).
