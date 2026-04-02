import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type KweaverAdminConfig = {
  baseUrl?: string;
};

const CONFIG_DIR = join(homedir(), ".kweaver-admin");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true });
  }
}

export function loadConfig(): KweaverAdminConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as KweaverAdminConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: KweaverAdminConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
