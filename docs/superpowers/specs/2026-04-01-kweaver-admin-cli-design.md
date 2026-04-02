# KWeaver Admin CLI — Design Spec

> **Date:** 2026-04-01
> **Status:** Approved
> **Scope:** OAuth auth, Org tree CRUD, User CRUD + role assignment, LLM + Small-model management

---

## 1 Context

KWeaver Admin CLI (`kweaver-admin`) is the CLI counterpart of the [deploy-web System Console](https://github.com/kweaver-ai/studio/tree/main/deploy-web). It calls existing KWeaver backend REST APIs to manage users, organisations, roles, and AI models.

### 1.1 References

| Source | Provides |
|--------|----------|
| [deploy-web](https://github.com/kweaver-ai/studio/tree/main/deploy-web) | Role system (SystemRoleType / UserRole / 三权分立), admin module structure, API proxy paths |
| [kweaver-sdk/packages/typescript](https://github.com/kweaver-ai/kweaver-sdk/tree/main/packages/typescript) | CLI style (Commander, `kweaver <group> <verb>`), auth flow (`~/.kweaver/`, OAuth, env vars) |
| [mf-model-manager](https://github.com/kweaver-ai/studio/tree/main/mf-model-manager) | LLM and small-model API routes, request/response schemas |
| [KWeaver TESTING.md](https://github.com/kweaver-ai/kweaver/blob/main/rules/TESTING.md) | Testing conventions |

### 1.2 Tech stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript, ESM, strict |
| Runtime | Node 18+ |
| CLI | Commander.js |
| HTTP | Node `fetch` |
| Build | tsup |
| Tests | Vitest |

---

## 2 Auth — Token Isolation

### 2.1 Problem

`kweaver` CLI stores tokens under `~/.kweaver/platforms/<base64(url)>/token.json`. The same platform URL may have both a **normal user** and an **admin** logged in. Sharing the same `token.json` causes conflicts.

### 2.2 Solution

`kweaver-admin` uses its own storage directory at **`~/.kweaver-admin/`**, mirroring the SDK structure:

```
~/.kweaver-admin/
├── state.json                    # currentPlatform (admin session)
├── config.json                   # CLI config (baseUrl, etc.)
└── platforms/
    └── <base64(url)>/
        ├── token.json            # admin accessToken / refreshToken
        └── client.json           # admin OAuth client credentials
```

### 2.3 Behaviour matrix

| Aspect | `kweaver` (normal user) | `kweaver-admin` |
|--------|-------------------------|-----------------|
| Token storage | `~/.kweaver/platforms/` | `~/.kweaver-admin/platforms/` |
| Login command | `kweaver auth login` | `kweaver-admin auth login` |
| Isolation | Writes own directory only | Writes own directory only |
| Env override | `KWEAVER_TOKEN` | `KWEAVER_ADMIN_TOKEN` (also accepts `KWEAVER_TOKEN` as fallback) |

### 2.4 Auth commands

```
kweaver-admin auth login [--base-url <url>]   # OAuth2 authorization code flow via browser
kweaver-admin auth logout                      # Remove stored tokens for current platform
kweaver-admin auth status                      # Show current auth state (base URL, token source, expiry)
kweaver-admin auth token                       # Print access token to stdout (with stderr warning)
```

### 2.5 OAuth flow

Same Hydra authorization-code flow as deploy-web:

1. Open browser → Hydra authorize endpoint
2. User logs in with admin account
3. Callback with `code`
4. Exchange code for `accessToken`, `refreshToken`, `idToken`
5. Store to `~/.kweaver-admin/platforms/<base64(url)>/token.json`
6. Auto-refresh when `expiresAt` is reached

### 2.6 Files

| File | Change |
|------|--------|
| `src/commands/auth.ts` | Implement login/logout/status/token |
| `src/lib/auth.ts` | Read from `~/.kweaver-admin/`, support `KWEAVER_ADMIN_TOKEN` env |
| `src/lib/config.ts` | Already exists; no change needed |

---

## 3 Organisation — Department Tree CRUD

### 3.1 Commands

```
kweaver-admin org list [--json]                         # List top-level organisations/departments
kweaver-admin org tree [--json]                         # Tree view of full org hierarchy
kweaver-admin org get <id> [--json]                     # Single department details
kweaver-admin org create --name <n> [--parent <id>]     # Create department (nestable)
kweaver-admin org update <id> --name <n>                # Rename department
kweaver-admin org delete <id>                           # Delete department
kweaver-admin org members <id> [--json]                 # List users in department
```

### 3.2 API endpoints

Backend: `user-management` service (same service deploy-web's `user-org` module uses).

```
GET    /api/user-management/v1/orgs
GET    /api/user-management/v1/orgs/{id}
POST   /api/user-management/v1/orgs
PATCH  /api/user-management/v1/orgs/{id}
DELETE /api/user-management/v1/orgs/{id}
GET    /api/user-management/v1/orgs/{id}/members
```

> Exact paths to be confirmed with `kweaver call` on first wiring.

### 3.3 `org tree` output example

```
├── Engineering (id: abc-123)
│   ├── Backend (id: def-456)
│   └── Frontend (id: ghi-789)
└── Operations (id: jkl-012)
```

`--json` outputs nested objects.

### 3.4 Files

| File | Change |
|------|--------|
| `src/commands/org.ts` | New — Commander registration |
| `src/lib/api-client.ts` | Add `listOrgs`, `getOrg`, `createOrg`, `updateOrg`, `deleteOrg`, `getOrgMembers`, `getOrgTree` |
| `src/index.ts` | Register `org` command group |

---

## 4 User CRUD + Role Assignment

### 4.1 Commands

```
kweaver-admin user list [--org <orgId>] [--json]               # List users, optionally filter by org
kweaver-admin user get <id> [--json]                            # User details
kweaver-admin user create --login <name> --password <pw> [--display-name <dn>] [--org <orgId>]
kweaver-admin user update <id> [--display-name <dn>] [--org <orgId>]
kweaver-admin user delete <id>
kweaver-admin user roles <id> [--json]                          # List user's current roles
kweaver-admin user assign-role <userId> <roleId>                # Assign an existing role
kweaver-admin user revoke-role <userId> <roleId>                # Remove a role
```

### 4.2 Design decisions

- **No role creation**: `role list` is read-only. The 7 built-in roles plus any platform-defined roles are used as-is. `assign-role` / `revoke-role` take existing `roleId` values.
- **Delete protection**: CLI warns when targeting 三权分立 built-in accounts (`system`, `admin`, `security`, `audit`). Server-side enforcement is the final guard.
- **Password**: `--password` required on `create`. Passed directly if the backend accepts initial passwords; otherwise falls back to invite flow.
- **Role commands unified under `user`**: `user assign-role` / `user revoke-role` instead of `role assign/revoke` — semantically clearer ("assign role to user" vs "assign user to role").

### 4.3 API endpoints

```
GET    /api/user-management/v1/users?orgId=...
GET    /api/user-management/v1/users/{id}
POST   /api/user-management/v1/users
PATCH  /api/user-management/v1/users/{id}
DELETE /api/user-management/v1/users/{id}
GET    /api/user-management/v1/users/{id}/roles
POST   /api/user-management/v1/users/{id}/roles           # assign
DELETE /api/user-management/v1/users/{id}/roles/{roleId}  # revoke
GET    /api/user-management/v1/roles                       # list all available roles
```

### 4.4 Simplified `role` command

```
kweaver-admin role list [--json]     # List all available roles (read-only)
```

The previous stubs for `role get/assign/revoke` are removed; role assignment is accessed via `user assign-role` / `user revoke-role`.

### 4.5 Files

| File | Change |
|------|--------|
| `src/commands/user.ts` | Implement CRUD + `roles`, `assign-role`, `revoke-role` |
| `src/commands/role.ts` | Simplify to `role list` only |
| `src/lib/api-client.ts` | Add user and role API methods |
| `src/lib/types.ts` | Add `User`, `OrgUnit`, `RoleAssignment` types |

---

## 5 Model Management — LLM + Small Model

### 5.1 Backend actuals

`mf-model-manager` exposes **two independent API sets**, not a unified model-manager:

| Type | Route prefix | Operations | Key field |
|------|-------------|------------|-----------|
| **LLM** (大模型) | `/llm/` | `add`, `delete`, `edit`, `list`, `get`, `test` | `model_series`: `AISHU` / `OpenAI` |
| **Small Model** (小模型) | `/small-model/` | `add`, `edit`, `delete`, `list`, `get`, `test` | `model_type`: `embedding` / `reranker` |

All mutations (`add`, `delete`, `edit`, `test`) use **POST**. `list` and `get` use **GET**. Delete accepts a list of IDs.

### 5.2 CLI commands

Two command groups mirroring the backend:

```
kweaver-admin llm list [--page 1 --size 20] [--series AISHU|OpenAI] [--name <filter>] [--json]
kweaver-admin llm get <modelId> [--json]
kweaver-admin llm add --name <n> --series OpenAI --api-model <m> --api-base <url> --api-key <key> [--icon <url>]
kweaver-admin llm edit <modelId> --name <n> [--icon <url>]
kweaver-admin llm delete <modelId...>
kweaver-admin llm test <modelId> [--json]

kweaver-admin small-model list [--page 1 --size 20] [--type embedding|reranker] [--name <filter>] [--json]
kweaver-admin small-model get <modelId> [--json]
kweaver-admin small-model add --name <n> --type embedding|reranker --api-url <url> --api-model <m> [--api-key <key>] [--batch-size 2048] [--max-tokens 512] [--embedding-dim 768]
kweaver-admin small-model edit <modelId> --name <n> [--api-url <url>] [--api-model <m>]
kweaver-admin small-model delete <modelId...>
kweaver-admin small-model test <modelId> [--json]
```

### 5.3 API endpoints

```
POST   /api/mf-model-manager/llm/add          body: { model_name, model_series, model_conf: { api_model, api_base, api_key }, model_type, icon }
POST   /api/mf-model-manager/llm/delete        body: { model_ids: [...] }
POST   /api/mf-model-manager/llm/edit          body: { model_id, model_name, icon }
GET    /api/mf-model-manager/llm/list?page=&size=&order=&rule=&series=&name=
GET    /api/mf-model-manager/llm/get?model_id=
POST   /api/mf-model-manager/llm/test          body: { model_id } or { model_conf... }

POST   /api/mf-model-manager/small-model/add   body: { model_name, model_type, model_config: { api_url, api_model, api_key }, batch_size, max_tokens, embedding_dim }
POST   /api/mf-model-manager/small-model/edit  body: { model_id, model_name, model_type, model_config, batch_size, ... }
POST   /api/mf-model-manager/small-model/delete body: { model_ids: [...] }
GET    /api/mf-model-manager/small-model/list?page=&size=&order=&rule=&model_name=&model_type=
GET    /api/mf-model-manager/small-model/get?model_id=
POST   /api/mf-model-manager/small-model/test  body: { model_id } or { model_name, model_type, model_config, ... }
```

### 5.4 `test` behaviour

Derived from actual backend code:

- **LLM test**: Backend sends a short chat completion request. Returns success/failure.
- **Small model test**:
  - `embedding`: Sends `["hello"]` for vectorisation. Returns success and verifies dimension matches declaration.
  - `reranker`: Sends `query="test", documents=["test"]` for re-ranking. Returns success/failure.

### 5.5 Output examples

Default (plain text):

```
$ kweaver-admin llm list
NAME             SERIES   MODEL      UPDATED
deepseek-chat    OpenAI   deepseek   2026-03-28
qwen-plus        OpenAI   qwen       2026-03-25
```

With `--json`:

```json
$ kweaver-admin llm list --json
{
  "data": [
    {
      "model_id": "abc123",
      "model_name": "deepseek-chat",
      "model_series": "OpenAI",
      "model_type": "deepseek",
      "icon": "",
      "update_time": "2026-03-28T10:00:00Z"
    },
    {
      "model_id": "def456",
      "model_name": "qwen-plus",
      "model_series": "OpenAI",
      "model_type": "qwen",
      "icon": "",
      "update_time": "2026-03-25T08:30:00Z"
    }
  ],
  "total": 2
}
```

Test output (plain text):

```
$ kweaver-admin small-model test 1234567890123456789
Model:   bge-large-zh (embedding)
Status:  OK
Dim:     1024 (matches declared)
```

Test output (`--json`):

```json
$ kweaver-admin small-model test 1234567890123456789 --json
{
  "model_id": "1234567890123456789",
  "model_name": "bge-large-zh",
  "model_type": "embedding",
  "status": "ok",
  "embedding_dim": 1024,
  "declared_dim": 1024,
  "dim_match": true
}
```

### 5.6 Files

| File | Change |
|------|--------|
| `src/commands/llm.ts` | New — replaces original `model.ts` |
| `src/commands/small-model.ts` | New |
| `src/lib/api-client.ts` | Add LLM and SmallModel method families |
| `src/lib/types.ts` | Add `LlmModel`, `SmallModel`, `ModelConf`, `SmallModelConfig` types |
| `src/index.ts` | Register `llm` and `small-model` groups; remove `model` |

---

## 6 Updated Command Tree

```
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
  config show|set
```

Global options: `--json`, `--base-url <url>`.

---

## 7 File Layout (target state)

```
src/
├── index.ts                   # CLI entry; registers all command groups
├── commands/
│   ├── auth.ts                # auth login|logout|status|token
│   ├── org.ts                 # org CRUD + tree + members
│   ├── user.ts                # user CRUD + roles + assign-role + revoke-role
│   ├── role.ts                # role list (read-only)
│   ├── llm.ts                 # LLM CRUD + test
│   ├── small-model.ts         # small-model CRUD + test
│   ├── audit.ts               # audit list (existing stub)
│   └── config.ts              # config show|set (existing)
├── lib/
│   ├── api-client.ts          # HTTP client — org, user, role, llm, small-model methods
│   ├── auth.ts                # Token resolution (~/.kweaver-admin/, env, auto-refresh)
│   ├── config.ts              # CLI config (~/.kweaver-admin/config.json)
│   └── types.ts               # SystemRoleType, UserRole, User, OrgUnit, LlmModel, SmallModel, etc.
└── utils/
    ├── output.ts              # Table / JSON formatting
    └── errors.ts              # User-facing error messages
```

---

## 8 Implementation Phases

| Phase | Module | Depends on |
|-------|--------|------------|
| 1 | **Auth** — token isolation, login/logout/status/token | — |
| 2 | **Org** — department tree CRUD | Auth |
| 3 | **User** — user CRUD + role assignment | Auth, Org (optional) |
| 4 | **Model** — LLM + small-model CRUD & test | Auth |

Each phase: wire real API → write unit tests → CLI smoke test (`npm run build && node dist/index.js <cmd> --help`).

---

## 9 Security Notes

- Tokens stored in `~/.kweaver-admin/platforms/` with restrictive file permissions (0600).
- `--api-key` values for model creation are transmitted over HTTPS; never logged or echoed.
- `auth token` prints to stdout with a warning on stderr.
- Built-in accounts (`system`, `admin`, `security`, `audit`) are protected; CLI warns before destructive operations.

---

## 10 Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Token storage | `~/.kweaver-admin/` (separate from `~/.kweaver/`) | Prevent admin/user token conflicts on the same domain |
| 2 | Model commands | Two groups (`llm`, `small-model`) | Mirrors backend's two independent API sets |
| 3 | Role assignment UX | `user assign-role` (not `role assign`) | Semantically clearer: "give this user a role" |
| 4 | Delete method | POST with ID list (not HTTP DELETE) | Follows backend convention |
| 5 | OAuth flow | Authorization code via browser | Same as deploy-web; headless via `KWEAVER_ADMIN_TOKEN` env |
| 6 | Old `model` command | Removed, replaced by `llm` + `small-model` | Alignment with actual backend |
