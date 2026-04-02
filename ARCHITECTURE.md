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

Global options: `--json` for machine-readable output where supported.

## Modules

- `commands`: Parse argv, validate options, call lib, print via utils.
- `lib/api-client`: Base URL, headers, error handling, `fetch` wrapper.
- `lib/auth`: Resolve base URL and admin token state (env -> `~/.kweaver-admin/platforms`).
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
