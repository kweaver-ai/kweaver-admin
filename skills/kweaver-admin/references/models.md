# Model Commands

This file describes `kweaver-admin` model operations and parameter semantics.

## Careful Comparison With KWeaver Core Docs

Compared with `kweaver/help/zh/model.md`, `kweaver-admin` currently exposes a
smaller and slightly different surface. Important differences:

- Core docs often show raw `kweaver call` payloads; this CLI provides typed
  subcommands with a narrower flag set.
- Core docs describe LLM payloads with `model_config.api_url` and
  `max_model_len`; this CLI currently uses `model_conf.api_base` and does not
  expose `max_model_len`.
- Core docs describe optional LLM `model_type` (`llm|rlm|vu`); this CLI does
  not expose `--model-type`.
- Core docs show small-model defaults like `batch_size: 32`; this CLI defaults
  to `--batch-size 2048`, `--max-tokens 512`, `--embedding-dim 768`.
- Core docs show `small-model/delete` with singular `model_id`; this CLI sends
  plural `model_ids` and accepts one or multiple ids.
- Core docs are stronger on provider guidance; this reference keeps those
  semantics but describes only what this CLI can directly express.

## Terminology and Semantics

- LLM category: managed under `llm` command group.
- Small model category: managed under `small-model` with
  `embedding|reranker` types.
- Backend family: `mf-model-manager` service.

### LLM `--series` guidance

Common series accepted by platform deployments include:
`tome`, `qwen`, `openai`, `internlm`, `deepseek`, `qianxun`, `claude`,
`chatglm`, `llama`, `others`, `baidu`, `baidu_tianchen`.

Important convention from KWeaver docs:

- `openai` is treated as Azure OpenAI style in many deployments.
- For non-Azure OpenAI-compatible endpoints, prefer `others`.
- Vendor-specific series (for example `qwen`, `deepseek`) should be preferred
  when available.

### LLM `model_type` guidance

According to KWeaver model-management docs, LLM `model_type` typically supports:

- `llm`
- `rlm`
- `vu`

Current `kweaver-admin llm add` behavior:

- CLI does **not** expose a `--model-type` option yet.
- Backend request omits `model_type`, which means the service default is used
  (commonly `llm` on standard deployments).

If you must force a non-default LLM type (for example `rlm`/`vu`), use
passthrough API call:

```bash
kweaver-admin call /api/mf-model-manager/v1/llm/add -X POST -d '{
  "model_name": "<name>",
  "model_series": "<series>",
  "model_type": "rlm",
  "model_conf": {
    "api_model": "<provider-model>",
    "api_base": "<provider-base-url>",
    "api_key": "<provider-key>"
  }
}'
```

## `llm` Commands

### `llm list`

Command:

```bash
kweaver-admin llm list [--page <n>] [--size <n>] [--series <series>] [--name <name>]
```

Parameters:

- `--page <n>`: page number, default `1`.
- `--size <n>`: page size, default `20`.
- `--series <series>`: filter by series.
- `--name <name>`: filter by model name.

### `llm get <modelId>`

- `<modelId>`: required model id.

### `llm add`

Command:

```bash
kweaver-admin llm add \
  --name <name> \
  --series <series> \
  --api-model <model> \
  --api-base <url> \
  --api-key <key> \
  [--icon <url>]
```

Required:

- `--name`: display/model name.
- `--series`: provider series.
- `--api-model`: provider model identifier.
- `--api-base`: provider API base URL.
- `--api-key`: provider API key.

Optional:

- `--icon`: icon URL.

Implementation mapping:

- `--api-model` -> `model_conf.api_model`
- `--api-base` -> `model_conf.api_base`
- `--api-key` -> `model_conf.api_key`
- `--series` -> `model_series`
- `--name` -> `model_name`

Note: this CLI's LLM payload uses `model_conf` and `api_base` naming, which
differs from some `kweaver call` examples that use `model_config` and `api_url`.

Current CLI gaps vs raw model-manager API:

- no `--model-type`
- no `--max-model-len`
- no direct flag for advanced model payload extensions shown in raw API docs

### `llm edit <modelId>`

- `--name <name>`: optional rename.
- `--icon <url>`: optional icon update.

### `llm delete <modelId...>`

- Accepts one or multiple model ids.

### `llm test <modelId>`

- Runs connectivity/test check against model manager.
- Non-JSON output prints `OK`/`FAIL`.

## `small-model` Commands

### `small-model list`

Command:

```bash
kweaver-admin small-model list [--page <n>] [--size <n>] [--type <type>] [--name <name>]
```

Parameters:

- `--page <n>`: default `1`.
- `--size <n>`: default `20`.
- `--type <type>`: `embedding|reranker`.
- `--name <name>`: model name filter.

### `small-model get <modelId>`

- `<modelId>`: required model id.

### `small-model add`

Command:

```bash
kweaver-admin small-model add \
  --name <name> \
  --type <embedding|reranker> \
  --api-url <url> \
  --api-model <model> \
  [--api-key <key>] \
  [--batch-size <n>] \
  [--max-tokens <n>] \
  [--embedding-dim <n>]
```

Required:

- `--name`
- `--type`: `embedding` or `reranker`
- `--api-url`
- `--api-model`

Optional (with defaults from CLI):

- `--api-key`
- `--batch-size` default `2048`
- `--max-tokens` default `512`
- `--embedding-dim` default `768`

Important comparison note:

- KWeaver Core help examples commonly use `batch_size: 32` for embedding/reranker
  examples.
- `kweaver-admin` CLI default is `2048`, which is a CLI convenience default, not
  a canonical platform default from the Core help.
- If provider limits are lower, pass `--batch-size` explicitly.

Implementation mapping:

- `--api-url` -> `model_config.api_url`
- `--api-model` -> `model_config.api_model`
- `--api-key` -> `model_config.api_key`
- `--type` -> `model_type`
- `--batch-size` -> `batch_size`
- `--max-tokens` -> `max_tokens`
- `--embedding-dim` -> `embedding_dim`

### `small-model edit <modelId>`

- `--name <name>`
- `--api-url <url>`
- `--api-model <model>`

Only provided fields are sent.

Current CLI gaps vs raw model-manager API:

- no `--api-key` edit path
- no `--type` edit path
- no `--batch-size` edit path
- no `--max-tokens` edit path
- no `--embedding-dim` edit path

### `small-model delete <modelId...>`

- Accepts one or multiple model ids.
- CLI sends `model_ids: string[]`.
- This differs from some raw API examples that show a singular `model_id`.

### `small-model test <modelId>`

- Runs connectivity/test check.
- Non-JSON output may include model type and embedding dim if returned.
