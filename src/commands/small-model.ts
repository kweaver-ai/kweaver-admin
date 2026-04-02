import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { exitUserError } from "../utils/errors";
import { printColumns, printJson } from "../utils/output";
import type { SmallModel } from "../lib/types";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
}

function listFromResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return ((data as { data?: T[] }).data ?? []) as T[];
}

export function registerSmallModelCommands(program: Command): void {
  const sm = program.command("small-model").description("Small model management");

  sm
    .command("list")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--type <type>", "Filter by type: embedding|reranker")
    .option("--name <name>", "Filter by model name")
    .description("List small models")
    .action(async (opts: { page: string; size: string; type?: string; name?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelList({
          page: Number(opts.page),
          size: Number(opts.size),
          model_type: opts.type,
          model_name: opts.name,
        });
        if (json) return printJson(data);
        const items = listFromResponse<SmallModel>(data);
        printColumns(
          ["NAME", "TYPE", "MODEL", "UPDATED"],
          items.map((m) => [
            m.model_name,
            m.model_type,
            m.model_config?.api_model ?? "-",
            m.update_time ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("get")
    .argument("<modelId>", "Model id")
    .description("Get small model details")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelGet(modelId);
        if (json) return printJson(data);
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("add")
    .requiredOption("--name <name>", "Model name")
    .requiredOption("--type <type>", "Type: embedding|reranker")
    .requiredOption("--api-url <url>", "API URL")
    .requiredOption("--api-model <model>", "API model")
    .option("--api-key <key>", "API key")
    .option("--batch-size <n>", "Batch size", "2048")
    .option("--max-tokens <n>", "Max tokens", "512")
    .option("--embedding-dim <n>", "Embedding dimension", "768")
    .description("Add small model")
    .action(
      async (opts: {
        name: string;
        type: string;
        apiUrl: string;
        apiModel: string;
        apiKey?: string;
        batchSize: string;
        maxTokens: string;
        embeddingDim: string;
      }) => {
        const json = program.opts<{ json?: boolean }>().json === true;
        const c = client(program);
        requireToken(c);
        try {
          const data = await c.smallModelAdd({
            model_name: opts.name,
            model_type: opts.type,
            model_config: {
              api_url: opts.apiUrl,
              api_model: opts.apiModel,
              api_key: opts.apiKey,
            },
            batch_size: Number(opts.batchSize),
            max_tokens: Number(opts.maxTokens),
            embedding_dim: Number(opts.embeddingDim),
          });
          if (json) return printJson(data);
          console.log(chalk.green(`Added small model: ${opts.name}`));
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  sm
    .command("edit")
    .argument("<modelId>", "Model id")
    .option("--name <name>", "Model name")
    .option("--api-url <url>", "API URL")
    .option("--api-model <model>", "API model")
    .description("Edit small model")
    .action(async (modelId: string, opts: { name?: string; apiUrl?: string; apiModel?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelEdit({
          model_id: modelId,
          model_name: opts.name,
          model_config:
            opts.apiUrl || opts.apiModel
              ? {
                  api_url: opts.apiUrl,
                  api_model: opts.apiModel,
                }
              : undefined,
        });
        if (json) return printJson(data);
        console.log(chalk.green(`Updated small model ${modelId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("delete")
    .argument("<modelId...>", "Model ids")
    .description("Delete small model(s)")
    .action(async (modelIds: string[]) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelDelete(modelIds);
        if (json) return printJson(data);
        console.log(chalk.green(`Deleted ${modelIds.length} model(s)`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("test")
    .argument("<modelId>", "Model id")
    .description("Test small model")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelTest({ model_id: modelId });
        if (json) return printJson(data);
        const result = data as {
          res?: string;
          model_name?: string;
          model_type?: string;
          embedding_dim?: number;
        };
        console.log(`Model:   ${result.model_name ?? modelId} (${result.model_type ?? "unknown"})`);
        console.log(`Status:  ${result.res === "success" ? chalk.green("OK") : chalk.red("FAIL")}`);
        if (result.embedding_dim !== undefined) {
          console.log(`Dim:     ${result.embedding_dim}`);
        }
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
