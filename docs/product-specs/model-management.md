# Model management

## Scope

Align with System Console model management for:

- LLM CRUD + connectivity test
- Small-model CRUD + test (`embedding` / `reranker`)

## Backend APIs (actual)

Model management is split into **two independent endpoint groups**:

- `POST/GET /api/mf-model-manager/llm/*`
- `POST/GET /api/mf-model-manager/small-model/*`

All mutations use `POST` (`add`, `edit`, `delete`, `test`), and reads use `GET` (`list`, `get`).

## CLI

### LLM

- `kweaver-admin llm list [--page 1 --size 20] [--series <series>] [--name <name>] [--json]`
- `kweaver-admin llm get <modelId> [--json]`
- `kweaver-admin llm add --name <name> --series <series> --api-model <model> --api-base <url> --api-key <key> [--icon <url>]`
- `kweaver-admin llm edit <modelId> [--name <name>] [--icon <url>]`
- `kweaver-admin llm delete <modelId...>`
- `kweaver-admin llm test <modelId> [--json]`

### Small model

- `kweaver-admin small-model list [--page 1 --size 20] [--type embedding|reranker] [--name <name>] [--json]`
- `kweaver-admin small-model get <modelId> [--json]`
- `kweaver-admin small-model add --name <name> --type embedding|reranker --api-url <url> --api-model <model> [--api-key <key>] [--batch-size 2048] [--max-tokens 512] [--embedding-dim 768]`
- `kweaver-admin small-model edit <modelId> [--name <name>] [--api-url <url>] [--api-model <model>]`
- `kweaver-admin small-model delete <modelId...>`
- `kweaver-admin small-model test <modelId> [--json]`

## Output

- Default: plain aligned text columns (no outer box)
- `--json`: structured JSON passthrough
