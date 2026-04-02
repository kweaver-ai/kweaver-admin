import {
  getAdminDir,
  hasValidSession,
  resolveBaseUrl,
  resolveToken,
  resolveTokenWithRefresh,
} from "./auth";
import type { KweaverAdminConfig } from "./config";

export type ApiClientOptions = {
  baseUrl?: string;
  token?: string;
  config?: KweaverAdminConfig;
};

/**
 * Thin HTTP client for KWeaver admin APIs. Stubs may avoid network until wired.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private token: string | undefined;
  private hasSession: boolean;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? resolveBaseUrl(opts.config);
    this.token = opts.token ?? resolveToken();
    this.hasSession = Boolean(this.token) || hasValidSession(getAdminDir());
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  hasToken(): boolean {
    return this.hasSession;
  }

  private async ensureFreshToken(): Promise<void> {
    const fresh = await resolveTokenWithRefresh(getAdminDir());
    if (fresh) this.token = fresh;
  }

  /**
   * Perform GET request; throws on non-OK unless `expectError` is used by caller.
   */
  async get(path: string, init?: RequestInit): Promise<Response> {
    return this.request(path, { ...init, method: "GET" });
  }

  async post(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    return this.request(path, {
      ...init,
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : init?.body,
    });
  }

  async patch(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    return this.request(path, {
      ...init,
      method: "PATCH",
      headers,
      body: body !== undefined ? JSON.stringify(body) : init?.body,
    });
  }

  async delete(path: string, init?: RequestInit): Promise<Response> {
    return this.request(path, { ...init, method: "DELETE" });
  }

  async request(path: string, init?: RequestInit): Promise<Response> {
    await this.ensureFreshToken();
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const headers = new Headers(init?.headers);
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    const businessDomain = process.env.KWEAVER_BUSINESS_DOMAIN;
    if (businessDomain) {
      headers.set("x-business-domain", businessDomain);
    }
    return fetch(url, { ...init, headers });
  }

  private async jsonOrThrow(res: Response): Promise<unknown> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<unknown>;
  }

  /**
   * Example: GET /api/user-management/v1/users/:id/roles
   */
  async getUserRoles(userId: string): Promise<unknown> {
    const res = await this.get(`/api/user-management/v1/users/${encodeURIComponent(userId)}/roles`);
    return this.jsonOrThrow(res);
  }

  async listOrgs(): Promise<unknown> {
    return this.jsonOrThrow(await this.get("/api/user-management/v1/orgs"));
  }

  async getOrg(id: string): Promise<unknown> {
    return this.jsonOrThrow(await this.get(`/api/user-management/v1/orgs/${encodeURIComponent(id)}`));
  }

  async createOrg(body: { name: string; parentId?: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/user-management/v1/orgs", body));
  }

  async updateOrg(id: string, body: { name?: string }): Promise<unknown> {
    return this.jsonOrThrow(
      await this.patch(`/api/user-management/v1/orgs/${encodeURIComponent(id)}`, body),
    );
  }

  async deleteOrg(id: string): Promise<void> {
    await this.jsonOrThrow(await this.delete(`/api/user-management/v1/orgs/${encodeURIComponent(id)}`));
  }

  async getOrgMembers(id: string): Promise<unknown> {
    return this.jsonOrThrow(
      await this.get(`/api/user-management/v1/orgs/${encodeURIComponent(id)}/members`),
    );
  }

  async listUsers(orgId?: string): Promise<unknown> {
    const params = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
    return this.jsonOrThrow(await this.get(`/api/user-management/v1/users${params}`));
  }

  async getUser(id: string): Promise<unknown> {
    return this.jsonOrThrow(await this.get(`/api/user-management/v1/users/${encodeURIComponent(id)}`));
  }

  async createUser(body: {
    login: string;
    password: string;
    displayName?: string;
    orgId?: string;
  }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/user-management/v1/users", body));
  }

  async updateUser(id: string, body: { displayName?: string; orgId?: string }): Promise<unknown> {
    return this.jsonOrThrow(
      await this.patch(`/api/user-management/v1/users/${encodeURIComponent(id)}`, body),
    );
  }

  async deleteUser(id: string): Promise<void> {
    await this.jsonOrThrow(await this.delete(`/api/user-management/v1/users/${encodeURIComponent(id)}`));
  }

  async assignRole(userId: string, roleId: string): Promise<unknown> {
    return this.jsonOrThrow(
      await this.post(`/api/user-management/v1/users/${encodeURIComponent(userId)}/roles`, {
        roleId,
      }),
    );
  }

  async revokeRole(userId: string, roleId: string): Promise<void> {
    await this.jsonOrThrow(
      await this.delete(
        `/api/user-management/v1/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
      ),
    );
  }

  async listRoles(): Promise<unknown> {
    return this.jsonOrThrow(await this.get("/api/user-management/v1/roles"));
  }

  async llmList(params?: {
    page?: number;
    size?: number;
    series?: string;
    name?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.size) qs.set("size", String(params.size));
    if (params?.series) qs.set("series", params.series);
    if (params?.name) qs.set("name", params.name);
    const query = qs.toString();
    return this.jsonOrThrow(
      await this.get(`/api/mf-model-manager/llm/list${query ? `?${query}` : ""}`),
    );
  }

  async llmGet(modelId: string): Promise<unknown> {
    return this.jsonOrThrow(
      await this.get(`/api/mf-model-manager/llm/get?model_id=${encodeURIComponent(modelId)}`),
    );
  }

  async llmAdd(body: {
    model_name: string;
    model_series: string;
    model_conf: { api_model: string; api_base: string; api_key: string };
    model_type?: string;
    icon?: string;
  }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/llm/add", body));
  }

  async llmEdit(body: { model_id: string; model_name?: string; icon?: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/llm/edit", body));
  }

  async llmDelete(modelIds: string[]): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/llm/delete", { model_ids: modelIds }));
  }

  async llmTest(body: { model_id: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/llm/test", body));
  }

  async smallModelList(params?: {
    page?: number;
    size?: number;
    model_type?: string;
    model_name?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.size) qs.set("size", String(params.size));
    if (params?.model_type) qs.set("model_type", params.model_type);
    if (params?.model_name) qs.set("model_name", params.model_name);
    const query = qs.toString();
    return this.jsonOrThrow(
      await this.get(`/api/mf-model-manager/small-model/list${query ? `?${query}` : ""}`),
    );
  }

  async smallModelGet(modelId: string): Promise<unknown> {
    return this.jsonOrThrow(
      await this.get(`/api/mf-model-manager/small-model/get?model_id=${encodeURIComponent(modelId)}`),
    );
  }

  async smallModelAdd(body: {
    model_name: string;
    model_type: string;
    model_config: { api_url: string; api_model: string; api_key?: string };
    batch_size?: number;
    max_tokens?: number;
    embedding_dim?: number;
  }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/small-model/add", body));
  }

  async smallModelEdit(body: {
    model_id: string;
    model_name?: string;
    model_type?: string;
    model_config?: { api_url?: string; api_model?: string; api_key?: string };
    batch_size?: number;
    max_tokens?: number;
    embedding_dim?: number;
  }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/small-model/edit", body));
  }

  async smallModelDelete(modelIds: string[]): Promise<unknown> {
    return this.jsonOrThrow(
      await this.post("/api/mf-model-manager/small-model/delete", { model_ids: modelIds }),
    );
  }

  async smallModelTest(body: { model_id: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/small-model/test", body));
  }

  async listAuditLogs(body: {
    page_num?: number;
    page_size?: number;
    user_name?: string;
    start_time?: string;
    end_time?: string;
  }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/eacp/v1/auth1/login-log", body));
  }
}
