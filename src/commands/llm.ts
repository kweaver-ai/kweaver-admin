import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { exitUserError } from "../utils/errors";
import { printColumns, printJson } from "../utils/output";
import type { LlmModel } from "../lib/types";

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

export function registerLlmCommands(program: Command): void {
  const llm = program.command("llm").description("Large language model management");

  llm
    .command("list")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--series <series>", "Filter by model series")
    .option("--name <name>", "Filter by model name")
    .description("List LLM models")
    .action(async (opts: { page: string; size: string; series?: string; name?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmList({
          page: Number(opts.page),
          size: Number(opts.size),
          series: opts.series,
          name: opts.name,
        });
        if (json) return printJson(data);
        const items = listFromResponse<LlmModel>(data);
        printColumns(
          ["NAME", "SERIES", "MODEL", "UPDATED"],
          items.map((m) => [
            m.model_name,
            m.model_series,
            m.model_conf?.api_model ?? "-",
            m.update_time ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("get")
    .argument("<modelId>", "Model id")
    .description("Get LLM model details")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmGet(modelId);
        if (json) return printJson(data);
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("add")
    .requiredOption("--name <name>", "Model name")
    .requiredOption("--series <series>", "Model series")
    .requiredOption("--api-model <model>", "API model")
    .requiredOption("--api-base <url>", "API base URL")
    .requiredOption("--api-key <key>", "API key")
    .option("--icon <url>", "Icon URL")
    .description("Add LLM model")
    .action(
      async (opts: {
        name: string;
        series: string;
        apiModel: string;
        apiBase: string;
        apiKey: string;
        icon?: string;
      }) => {
        const json = program.opts<{ json?: boolean }>().json === true;
        const c = client(program);
        requireToken(c);
        try {
          const data = await c.llmAdd({
            model_name: opts.name,
            model_series: opts.series,
            model_conf: {
              api_model: opts.apiModel,
              api_base: opts.apiBase,
              api_key: opts.apiKey,
            },
            icon: opts.icon,
          });
          if (json) return printJson(data);
          console.log(chalk.green(`Added LLM: ${opts.name}`));
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  llm
    .command("edit")
    .argument("<modelId>", "Model id")
    .option("--name <name>", "Model name")
    .option("--icon <url>", "Icon URL")
    .description("Edit LLM model")
    .action(async (modelId: string, opts: { name?: string; icon?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmEdit({ model_id: modelId, model_name: opts.name, icon: opts.icon });
        if (json) return printJson(data);
        console.log(chalk.green(`Updated LLM ${modelId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("delete")
    .argument("<modelId...>", "Model ids")
    .description("Delete LLM model(s)")
    .action(async (modelIds: string[]) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmDelete(modelIds);
        if (json) return printJson(data);
        console.log(chalk.green(`Deleted ${modelIds.length} model(s)`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("test")
    .argument("<modelId>", "Model id")
    .description("Test LLM model")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmTest({ model_id: modelId });
        if (json) return printJson(data);
        const result = data as { res?: string };
        console.log(`Model:   ${modelId}`);
        console.log(`Status:  ${result.res === "success" ? chalk.green("OK") : chalk.red("FAIL")}`);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
