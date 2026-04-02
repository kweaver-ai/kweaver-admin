# Roles and permissions

## UserRole (string)

| Role | Description |
|------|-------------|
| `super_admin` | Super administrator |
| `sys_admin` | System administrator |
| `sec_admin` | Security administrator |
| `audit_admin` | Audit administrator |
| `org_manager` | Organization manager |
| `org_audit` | Organization auditor |
| `normal_user` | Normal user |

## SystemRoleType (UUID)

Mapped 1:1 to `UserRole` in code (`src/lib/types.ts`). UUIDs come from the platform (see deploy-web `SystemRoleType`).

## 三权分立 built-in accounts

Reserved names: `system`, `admin`, `security`, `audit` — treat as protected in automation.

## Menu visibility (reference)

Deploy-web filters admin UI by role; CLI commands should enforce server-side permissions — the CLI only presents operations; authorization is always on the API.
