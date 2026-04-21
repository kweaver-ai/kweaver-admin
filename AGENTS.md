# Agent instructions — kweaver-admin

This repository is the **KWeaver Admin CLI**: a TypeScript command-line tool that calls existing KWeaver backend REST APIs for administration (users, roles, audit, models, config). It is the CLI counterpart of the System Console pattern used in [deploy-web](https://github.com/kweaver-ai/studio/tree/main/deploy-web).

## 业务流程（Superpowers）

**Priority:** User instructions (`AGENTS.md`, chat) > **Superpowers workflow** > default model behavior.

| Phase | When | Skill / action |
|-------|------|----------------|
| 1. Gate | Every task | **using-superpowers** — if any skill might apply (~1%), follow it before acting. **Process skills before implementation skills.** |
| 2. Design | New feature, behavior change, non-trivial work | **brainstorming** — clarify intent, options, approval; **no code until design is accepted** (can be short). Design doc: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` unless user overrides. |
| 3. Plan | Multi-step / multi-file work | **writing-plans** — bite-sized tasks, files, tests. Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` unless user overrides. |
| 4. Execute | After plan exists | **subagent-driven-development** (same session, independent tasks) or **executing-plans** (parallel session); use **test-driven-development** when the skill applies. |
| 5. Debug | Failures / bugs | **systematic-debugging** before guessing fixes. |
| 6. Verify | Before “done”, commit, or PR | **verification-before-completion** — run the real commands in this session; **no success claims without fresh output** (see Testing below). |
| 7. Ship | Branch / merge | Optional: **requesting-code-review**, **receiving-code-review**, **finishing-a-development-branch**. |

**Cursor:** There is no Claude `Skill` tool — read the skill `SKILL.md` from the Superpowers plugin path when needed, or follow this table and [docs/superpowers/workflow.md](docs/superpowers/workflow.md).

**Checklists:** When a skill requires a checklist, mirror it with Todo items and complete in order.

Full diagram and anti-patterns: [docs/superpowers/workflow.md](docs/superpowers/workflow.md).

## Alignment with kweaver-sdk

Behavior and env vars should stay consistent with [`@kweaver-ai/kweaver-sdk`](https://github.com/kweaver-ai/kweaver-sdk/tree/main/packages/typescript) / the `kweaver` CLI where applicable:

- **`KWEAVER_BASE_URL`** — platform base URL (see SDK README for auth and API usage).
- **`KWEAVER_TOKEN`** — access token (CI or headless).
- **`KWEAVER_BUSINESS_DOMAIN`** — tenant-scoped APIs; many list/query APIs require a business domain (often a UUID, not only `bd_public`).
- **`KWEAVER_TLS_INSECURE`** / per-platform insecure TLS from `kweaver auth login --insecure` — dev-only; mirror SDK docs when documenting TLS.

Prefer `kweaver auth login` (or exported refresh-token flow) for interactive login; this CLI does not duplicate full OAuth flows unless explicitly implemented.

## Tech stack

- **Language**: TypeScript, **ESM** (`"type": "module"`), **strict** mode
- **Runtime**: Node **18+** (`package.json` engines); use **22+** when testing alongside the published SDK locally (SDK README requires Node ≥ 22)
- **CLI**: Commander.js
- **HTTP**: `fetch` (Node 18+)
- **Build**: tsup
- **Tests**: Vitest

Avoid `any`; prefer explicit types and `unknown` with narrowing.

## Layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI entry; registers subcommands |
| `src/commands/` | Command modules (`auth`, `user`, `role`, `audit`, `model`, `config`) |
| `src/lib/` | `api-client`, `auth`, `config` (~/.kweaver-admin/config.json), `types` |
| `src/utils/` | Output formatting, errors |

## Auth and secrets

- Prefer **`~/.kweaver/`** token files when aligned with the `kweaver` CLI, or **`KWEAVER_TOKEN`** / **`KWEAVER_BASE_URL`**.
- Local CLI config: **`~/.kweaver-admin/config.json`** (e.g. `baseUrl`) via `kweaver-admin config set baseUrl <url>`.
- Do **not** log access tokens, refresh tokens, or print them except in dedicated commands (e.g. `auth token`) with clear warnings.

## CLI conventions

- Global options: **`--json`**, **`--base-url`** (see `src/index.ts`). Behavior and pitfalls: [docs/superpowers/specs/2026-04-20-cli-json-global.md](docs/superpowers/specs/2026-04-20-cli-json-global.md).
- Subcommands: `verb` + `noun` groups (`user list`, `role list`, …); keep help text consistent with Commander’s `--help`.
- For arbitrary HTTP while debugging, operators may use **`kweaver call`** from the SDK; this repo’s `api-client` should implement stable admin operations as first-class commands.

## API contracts

- Role and endpoint shapes: [docs/product-specs/](docs/product-specs/) and [docs/references/](docs/references/).
- When wiring HTTP, align paths with backend OpenAPI or platform docs; stubs may return structured placeholders until APIs are confirmed.

## Testing (adapted from KWeaver-Core testing rules)

The [KWeaver-Core TESTING](https://github.com/kweaver-ai/kweaver/blob/main/rules/TESTING.md) spec targets multi-language repos with Makefiles; **this repo** uses a small TypeScript mapping:

| Concept | This repo |
|---------|-----------|
| **Default `npm test`** | **Unit tests only** — no real network, no required backend (Vitest). |
| **Integration / acceptance** | Optional: separate `*.integration.test.ts` or `test-at` script later; require env (e.g. `KWEAVER_BASE_URL`, `KWEAVER_TOKEN`) and document in test README or `docs/`. |
| **Before claiming done** | **verification-before-completion:** run **`npm run typecheck`** and **`npm test`** in this session; for CLI changes, **`npm run build`** then **`node dist/index.js --help`**. Do not claim pass without pasting or relying on fresh command output. |

Add **`test-result/`** to `.gitignore` if future coverage/report scripts write there (per org-wide TESTING.md artifact layout).

## Documentation

Product and design docs live under [docs/](docs/). Update specs when behavior or API surface changes. Cross-link [ARCHITECTURE.md](ARCHITECTURE.md) for command tree and service boundaries.

Superpowers artifacts: **designs** → `docs/superpowers/specs/`; **implementation plans** → `docs/superpowers/plans/` (see [docs/superpowers/workflow.md](docs/superpowers/workflow.md)).
