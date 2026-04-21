import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdminState, ClientConfig, TokenConfig } from "./types";

export function encodePlatformUrl(url: string): string {
  return Buffer.from(url).toString("base64url");
}

function platformDir(adminDir: string, url: string): string {
  return join(adminDir, "platforms", encodePlatformUrl(url));
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { mode: 0o700, recursive: true });
  }
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJsonFile(path: string, data: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

export function readToken(adminDir: string, url: string): TokenConfig | undefined {
  const raw = readJsonFile<TokenConfig>(join(platformDir(adminDir, url), "token.json"));
  if (!raw) return undefined;
  if (raw.tlsInsecure === undefined && raw.insecure !== undefined) {
    const { insecure: _legacy, ...rest } = raw;
    return { ...rest, tlsInsecure: _legacy };
  }
  return raw;
}

export function writeToken(adminDir: string, url: string, token: TokenConfig): void {
  writeJsonFile(join(platformDir(adminDir, url), "token.json"), token);
}

export function deleteToken(adminDir: string, url: string): void {
  const file = join(platformDir(adminDir, url), "token.json");
  if (existsSync(file)) rmSync(file);
}

export function readClient(adminDir: string, url: string): ClientConfig | undefined {
  return readJsonFile<ClientConfig>(join(platformDir(adminDir, url), "client.json"));
}

export function writeClient(adminDir: string, url: string, client: ClientConfig): void {
  writeJsonFile(join(platformDir(adminDir, url), "client.json"), client);
}

export function readState(adminDir: string): AdminState | undefined {
  return readJsonFile<AdminState>(join(adminDir, "state.json"));
}

export function writeState(adminDir: string, state: AdminState): void {
  writeJsonFile(join(adminDir, "state.json"), state);
}

/** Per-platform non-auth settings (aligned with kweaver-sdk `platforms/<id>/config.json`). */
export type PlatformStoredConfig = {
  businessDomain?: string;
};

export function readPlatformConfig(adminDir: string, url: string): PlatformStoredConfig | undefined {
  return readJsonFile<PlatformStoredConfig>(join(platformDir(adminDir, url), "config.json"));
}

export function writePlatformConfig(adminDir: string, url: string, config: PlatformStoredConfig): void {
  writeJsonFile(join(platformDir(adminDir, url), "config.json"), config);
}

export function savePlatformBusinessDomain(adminDir: string, url: string, businessDomain: string): void {
  const existing = readPlatformConfig(adminDir, url) ?? {};
  writePlatformConfig(adminDir, url, { ...existing, businessDomain });
}

export function loadPlatformBusinessDomain(adminDir: string, url: string): string | undefined {
  return readPlatformConfig(adminDir, url)?.businessDomain?.trim();
}
