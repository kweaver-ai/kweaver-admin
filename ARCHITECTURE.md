# Architecture — kweaver-admin

## Overview

```text
kweaver-admin CLI
  |
  +--> ~/.kweaver-admin/ (admin token/config storage)
  +--> Environment: KWEAVER_BASE_URL, KWEAVER_ADMIN_TOKEN, KWEAVER_TOKEN
  |
  +--> KWeaver Backend APIs (REST)
       +-- user-management   (/api/user-management/v1/...)
       +-- deploy-manager    (/api/deploy-manager/v1/...)
       +-- deploy-auth       (/api/deploy-auth/...)
       +-- eacp              (/api/eacp/v1/...)
       +-- mf-model-manager  (/api/mf-model-manager/llm/*, /small-model/*)
       +-- OAuth2 (Hydra)    (via platform login flows)
```

## Command tree (MVP)

```text
kweaver-admin
  auth login|logout|status|token
  org list|tree|get|create|update|delete|members
  user list|get|create|update|delete
  user roles <userId>
  user assign-role <userId> <roleId>
  user revoke-role <userId> <roleId>
  role list
  llm list|get|add|edit|delete|test
  small-model list|get|add|edit|delete|test
  audit list
  config show|set
```

Global options: `--json` for machine-readable output where supported. Subcommands must read it via `optsWithGlobals()` (see `lib/cli-json.ts` `wantsJsonOutput`); `call`/`curl` bypass Commander — see `lib/call-route.ts` and `wantsJsonFromArgv`. Spec: [docs/superpowers/specs/2026-04-20-cli-json-global.md](docs/superpowers/specs/2026-04-20-cli-json-global.md).

## Modules

- `commands`: Parse argv, validate options, call lib, print via utils.
- `lib/api-client`: Base URL, headers, error handling, `fetch` wrapper.
- `lib/auth`: Resolve base URL and admin token state (env -> `~/.kweaver-admin/platforms`).
- `lib/cli-json`: Global `--json` detection for Commander actions (`wantsJsonOutput`) and raw argv (`wantsJsonFromArgv`).
- `lib/call-route`: Locate `call`/`curl` in argv when global flags precede the keyword.
- `lib/types`: `UserRole`, `SystemRoleType`, and shared DTOs.
- `utils/output`: Plain aligned columns vs JSON.
- `utils/errors`: User-facing messages, exit codes.

## Role model (reference)

Seven string roles (`UserRole`) map to UUID system roles (`SystemRoleType`); see [docs/product-specs/role-permission.md](docs/product-specs/role-permission.md).

## Development process (Superpowers)

Agent workflow (brainstorm → plan → execute → verify) is defined in [AGENTS.md](AGENTS.md) and [docs/superpowers/workflow.md](docs/superpowers/workflow.md).

## References

- [docs/DESIGN.md](docs/DESIGN.md) — design overview
- [docs/SECURITY.md](docs/SECURITY.md) — tokens and audit expectations
- [docs/superpowers/workflow.md](docs/superpowers/workflow.md) — business process for agents
