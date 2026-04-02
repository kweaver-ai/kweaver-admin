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
  return readJsonFile<TokenConfig>(join(platformDir(adminDir, url), "token.json"));
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
