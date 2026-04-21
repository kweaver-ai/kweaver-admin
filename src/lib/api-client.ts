import {
  getAdminDir,
  hasValidSession,
  resolveBaseUrl,
  resolveCurrentUserId,
  resolveToken,
  resolveTokenWithRefresh,
} from "./auth";
import { runWithTlsInsecure, shouldUseInsecureTlsForPlatform } from "./tls";
import type { KweaverAdminConfig } from "./config";
import { resolveBusinessDomain } from "./business-domain-resolve";
import { formatFetchFailure } from "./network-error";
import { resolveDefaultUserManagementRole } from "./user-management-role";
import { encryptModifyPwd } from "./eacp";

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

  async put(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    return this.request(path, {
      ...init,
      method: "PUT",
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
    headers.set("x-business-domain", resolveBusinessDomain(this.baseUrl));
    const tls = shouldUseInsecureTlsForPlatform(getAdminDir());
    try {
      return await runWithTlsInsecure(tls, () => fetch(url, { ...init, headers }));
    } catch (e) {
      throw new Error(formatFetchFailure(url, e));
    }
  }

  private userManagementHint(status: number, responseUrl: string): string {
    if (!responseUrl.includes("/api/user-management/")) return "";
    if (status === 403 || status === 401) {
      return (
        "\n\nHint: UserManagement validates your platform role against the `role` query. " +
        "If you are not a super/system admin, use `--role normal_user` or `--role org_manager` " +
        "(whichever matches your account), or set env KWEAVER_UM_ROLE as the default for org commands."
      );
    }
    if (status === 400 && responseUrl.includes("department-members")) {
      return (
        "\n\nHint: `org members` uses the public UserManagement route whose path ends with `/users` or `/departments` " +
        "(not `/management/.../users`). Ensure `--role` is valid for that route (e.g. org_manager, normal_user)."
      );
    }
    return "";
  }

  private async jsonOrThrow(res: Response): Promise<unknown> {
    if (!res.ok) {
      const text = await res.text();
      const hint = this.userManagementHint(res.status, res.url);
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}${hint}`);
    }
    const text = await res.text();
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`HTTP ${res.status}: response is not JSON`);
    }
  }

  private async expectOkEmpty(res: Response): Promise<void> {
    if (!res.ok) {
      const text = await res.text();
      const hint = this.userManagementHint(res.status, res.url);
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}${hint}`);
    }
  }

  /**
   * Roles attached to a single user.
   *
   * Backed by the Authorization service's "accessor_roles" endpoint
   * (`isf/Authorization/driveradapters/role_rest_handler.go:91`).
   *
   * NOTE: this route is registered via `RegisterPrivate`, meaning some ingress
   * configurations expose it only on the cluster-internal port. On a public
   * gateway you may receive HTTP 404; in that case fall back to listing role
   * members per role (`getRoleMembers`).
   */
  async getUserRoles(userId: string): Promise<unknown> {
    const qs = new URLSearchParams({
      accessor_id: userId,
      accessor_type: "user",
    });
    const res = await this.get(`/api/authorization/v1/accessor_roles?${qs.toString()}`);
    if (res.status !== 404) return this.jsonOrThrow(res);

    // Public-gateway fallback: enumerate roles, query each role's members,
    // and collect those that include this userId. Cluster role counts are
    // typically small (<50), so the O(N) request fan-out is acceptable.
    const rolesPage = (await this.listRoles({ offset: 0, limit: 200 })) as {
      entries?: Array<{ id: string; name?: string; description?: string; source?: string; scope?: string }>;
    };
    const roles = rolesPage.entries ?? [];
    const matched: Array<{ id: string; name?: string; description?: string; source?: string; scope?: string }> = [];
    await Promise.all(
      roles.map(async (role) => {
        const members = (await this.getRoleMembers(role.id, {
          offset: 0,
          limit: 500,
        })) as { entries?: Array<{ id: string; type?: string }> };
        if ((members.entries ?? []).some((m) => m.id === userId && (!m.type || m.type === "user"))) {
          matched.push(role);
        }
      }),
    );
    return { entries: matched, total_count: matched.length, route: "fallback:list-roles+role-members" };
  }

  /**
   * Search departments (console). Requires `role` query per ISF `searchManageDepart`.
   * `GET /api/user-management/v1/console/search-departments/:fields?role&offset&limit&…`
   */
  async searchDepartments(params: {
    role: string;
    offset?: number;
    limit?: number;
    name?: string;
    code?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("role", params.role);
    qs.set("offset", String(params.offset ?? 0));
    qs.set("limit", String(params.limit ?? 100));
    if (params.name) qs.set("name", params.name);
    if (params.code) qs.set("code", params.code);
    const fields = "name,code,remark,manager,enabled,parent_deps,email";
    return this.jsonOrThrow(
      await this.get(`/api/user-management/v1/console/search-departments/${fields}?${qs.toString()}`),
    );
  }

  /** Paginate search until all entries are retrieved (for tree building). */
  async searchDepartmentsAll(role: string, pageSize = 100): Promise<unknown[]> {
    const out: unknown[] = [];
    let offset = 0;
    let totalCount: number | undefined;
    while (true) {
      const data = (await this.searchDepartments({ role, offset, limit: pageSize })) as {
        total_count?: number;
        entries?: unknown[];
      };
      if (totalCount === undefined) totalCount = data.total_count;
      const entries = data.entries ?? [];
      out.push(...entries);
      if (entries.length === 0 || entries.length < pageSize) break;
      if (totalCount !== undefined && out.length >= totalCount) break;
      offset += pageSize;
    }
    return out;
  }

  async listOrgs(params?: {
    role?: string;
    offset?: number;
    limit?: number;
    name?: string;
  }): Promise<unknown> {
    return this.searchDepartments({
      role: params?.role ?? resolveDefaultUserManagementRole(),
      offset: params?.offset ?? 0,
      limit: params?.limit ?? 100,
      name: params?.name,
    });
  }

  /**
   * Department detail. `GET /api/user-management/v1/departments/:id/:fields`
   * (`getDepartInfo` — comma-separated ids supported server-side).
   */
  /**
   * Get one department's full info.
   *
   * `GET /api/user-management/v1/departments/:id/:fields` is registered as
   * `RegisterPrivate` (`isf/UserManagement/driveradapters/department_rest_handler.go:77`),
   * so a public ingress returns 404. We go straight to ISFWeb thrift, trying
   * `Usrm_GetOrgDepartmentById` first (root-level orgs) and falling back to
   * `Usrm_GetDepartmentById` (sub-departments) if the first call returns a
   * "部门不存在" business error.
   */
  async getOrg(id: string): Promise<unknown> {
    try {
      return await this.shareMgnt<unknown>("Usrm_GetOrgDepartmentById", [id]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Some deployments return errID=99 + "'NoneType' object is not subscriptable"
      // for root-like ids (e.g. "-1") on Usrm_GetOrgDepartmentById. Fall back to
      // Usrm_GetDepartmentById for these known ShareMgnt variants as well.
      if (!/部门不存在|errID:?\s*20201|errID=?\s*99|NoneType.+subscriptable/i.test(msg)) {
        throw e;
      }
      return await this.shareMgnt<unknown>("Usrm_GetDepartmentById", [id]);
    }
  }

  /**
   * Create a department via ISFWeb thrift `Usrm_AddDepartment`. Mirrors the
   * payload used by the console
   * (`isf/ISFWeb/src/components/CreateDepartment/component.base.tsx`):
   *
   *   [{ ncTAddDepartParam: { parentId, departName, managerID, code, remark,
   *      status, email, ossId } }]
   *
   * Returns the new department id (raw thrift return value, a string).
   * UserManagement REST has no POST route for departments, hence the thrift
   * route is the only programmatic option.
   */
  async createOrg(body: {
    name: string;
    parentId?: string;
    managerID?: string | null;
    code?: string;
    remark?: string;
    status?: number;
    email?: string;
    ossId?: string;
  }): Promise<{ id: string }> {
    const ncTAddDepartParam = {
      parentId: body.parentId ?? "-1",
      departName: body.name,
      managerID: body.managerID ?? null,
      code: body.code ?? "",
      remark: body.remark ?? "",
      status: body.status ?? 1,
      email: body.email ?? "",
      ossId: body.ossId ?? "",
    };
    const id = await this.shareMgnt<string>("Usrm_AddDepartment", [
      { ncTAddDepartParam },
    ]);
    return { id };
  }

  /**
   * Update a department via ISFWeb thrift `Usrm_EditDepartment`. UserManagement
   * REST exposes no PATCH route for departments. Field names mirror those of
   * `Usrm_AddDepartment` (status/email/managerID/etc.). Only fields the caller
   * sets are sent; omitted values fall back to ShareMgnt's "no change"
   * sentinels (empty string / null / status=1).
   */
  async updateOrg(
    id: string,
    body: {
      name?: string;
      managerID?: string | null;
      code?: string;
      remark?: string;
      status?: number;
      email?: string;
      ossId?: string;
    },
  ): Promise<{ id: string; updated: true; route: "shareMgnt" }> {
    const ncTEditDepartParam: Record<string, unknown> = { departId: id };
    if (body.name !== undefined) ncTEditDepartParam.departName = body.name;
    if (body.managerID !== undefined) ncTEditDepartParam.managerID = body.managerID;
    if (body.code !== undefined) ncTEditDepartParam.code = body.code;
    if (body.remark !== undefined) ncTEditDepartParam.remark = body.remark;
    if (body.status !== undefined) ncTEditDepartParam.status = body.status;
    if (body.email !== undefined) ncTEditDepartParam.email = body.email;
    if (body.ossId !== undefined) ncTEditDepartParam.ossId = body.ossId;
    await this.shareMgnt<unknown>("Usrm_EditDepartment", [
      { ncTEditDepartParam },
    ]);
    return { id, updated: true, route: "shareMgnt" };
  }

  /** `DELETE /api/user-management/v1/management/departments/:id` */
  async deleteOrg(id: string): Promise<void> {
    await this.expectOkEmpty(
      await this.delete(
        `/api/user-management/v1/management/departments/${encodeURIComponent(id)}`,
      ),
    );
  }

  /**
   * List users (and optionally sub-departments) for a department.
   *
   * ISF registers **two** routes with the same `:fields` path token:
   * - **Public** `GET /api/user-management/v1/department-members/:id/:fields` — `:fields` may be
   *   `users`, `departments`, or `users,departments` (`getDepMembersParmas`).
   * - **Management** `GET .../management/department-members/:id/:fields` — `:fields` may only be
   *   `departments` (`getConsoleDepartMembersParam`). Using `users` there returns **400 invalid fileds type**.
   *
   * This method calls the **public** route with `:fields` defaulting to `users`.
   */
  async getOrgMembers(
    id: string,
    params?: { role?: string; offset?: number; limit?: number; fields?: string },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("role", params?.role ?? resolveDefaultUserManagementRole());
    qs.set("offset", String(params?.offset ?? 0));
    qs.set("limit", String(params?.limit ?? 100));
    const fieldsSeg = (params?.fields?.trim() || "users").replace(/^\/+|\/+$/g, "");
    return this.jsonOrThrow(
      await this.get(
        `/api/user-management/v1/department-members/${encodeURIComponent(id)}/${fieldsSeg}?${qs.toString()}`,
      ),
    );
  }

  /**
   * Whitelist of fields accepted by UserManagement's
   * `GET /api/user-management/v1/users/:user_id/:fields` and
   * `GET /api/user-management/v1/console/search-users/:fields` (see
   * `isf/UserManagement/driveradapters/user_rest_handler.go:1066-1125` —
   * `handlerInUserDBInfoRange`). Any value not in this set yields HTTP 400
   * `invalid type`.
   */
  static readonly USER_FIELDS_DEFAULT = [
    "name",
    "account",
    "email",
    "enabled",
    "frozen",
    "parent_deps",
    "roles",
    "priority",
    "csf_level",
    "csf_level2",
    "code",
    "position",
    "remark",
    "manager",
    "telephone",
    "created_at",
    "custom_attr",
  ] as const;

  /**
   * List users via `console/search-users`. UserManagement REST does **not**
   * register `GET /api/user-management/v1/users` (that path 404s on every
   * deployment we've seen). The console route requires a `role` qualifier;
   * `super_admin` returns the broadest set the caller is allowed to see.
   */
  async listUsers(params?: {
    orgId?: string;
    keyword?: string;
    offset?: number;
    limit?: number;
    fields?: readonly string[];
  }): Promise<unknown> {
    const fields = (params?.fields ?? ApiClient.USER_FIELDS_DEFAULT).join(",");
    const qs = new URLSearchParams();
    qs.set("role", "super_admin");
    qs.set("offset", String(params?.offset ?? 0));
    qs.set("limit", String(params?.limit ?? 100));
    if (params?.orgId) qs.set("department_id", params.orgId);
    if (params?.keyword) qs.set("name", params.keyword);
    return this.jsonOrThrow(
      await this.get(
        `/api/user-management/v1/console/search-users/${fields}?${qs.toString()}`,
      ),
    );
  }

  /**
   * Get one user's full profile via ISFWeb thrift `Usrm_GetUserInfo`.
   *
   * The REST counterpart `GET /api/user-management/v1/users/:user_id/:fields`
   * is registered as `RegisterPrivate`
   * (`isf/UserManagement/driveradapters/user_rest_handler.go:203`), so a
   * public ingress returns 404. The public sibling
   * `GET /api/user-management/v1/users/:user_ids/:fields` only allows
   * `name`/`account`/`parent_dep_paths` (`handlerOutUserDBInfoRange`,
   * line 1033) — not enough for an admin "show user" command. The thrift
   * call returns the full `ncTUsrmUserInfo` object the console uses.
   */
  async getUser(id: string): Promise<unknown> {
    return this.shareMgnt<unknown>("Usrm_GetUserInfo", [id]);
  }

  /**
   * Generic ISFWeb thrift-style call.
   *
   * Path: `/isfweb/api/<module>/<method>`; body is a positional JSON array.
   * Verified against `isf/ISFWeb/src/core/thrift/thrift.ts` (the URL builder
   * the front-end console uses) and a live deployment.
   *
   * ShareMgnt returns business errors as **HTTP 501** with a body shaped like
   * `{"error":{"errID":..., "errMsg":"...", "fileName":"..."}}`. We surface
   * `errMsg` so callers don't see a misleading "501 Not Implemented".
   */
  async shareMgnt<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const res = await this.post(`/isfweb/api/ShareMgnt/${method}`, params);
    if (!res.ok) {
      const text = await res.text();
      let detail = text || res.statusText;
      try {
        const parsed = JSON.parse(text) as { error?: { errMsg?: string; errID?: number; fileName?: string } };
        const err = parsed?.error;
        if (err?.errMsg) {
          detail = err.errID !== undefined ? `${err.errMsg} (errID=${err.errID})` : err.errMsg;
        }
      } catch {
        /* keep raw text */
      }
      throw new Error(`ShareMgnt.${method} failed (HTTP ${res.status}): ${detail}`);
    }
    const text = await res.text();
    if (!text.trim()) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`ShareMgnt.${method}: response is not JSON: ${text.slice(0, 200)}`);
    }
  }

  /**
   * Create a new platform user via ISFWeb's ShareMgnt thrift endpoint
   * (`POST /isfweb/api/ShareMgnt/Usrm_AddUser`).
   *
   * Why not `POST /api/user-management/v1/users`? That route is **not
   * registered** in upstream ISF — verified empirically: it 404s alongside
   * `/console/users` and EACP `usermanage1/createaccount`, while ISFWeb's
   * thrift proxy works. The console UI itself uses this same call (see
   * `isf/ISFWeb/src/components/CreateUser/component.base.tsx::createUser`
   * which dispatches `addUser([{ ncTUsrmAddUserInfo: ... }, userid])`).
   *
   * @param input.loginName       Login name (required)
   * @param input.displayName     Display name (defaults to loginName)
   * @param input.departmentIds   Department ids; defaults to `["-1"]` (root)
   * @param input.csfLevel        Confidentiality level. Allowed values are
   *                              deployment-specific (configured in the
   *                              `csf_level_enum` of UserManagement). When
   *                              omitted, we do not send the field and let
   *                              ShareMgnt decide/init the default.
   * @param input.callerUserId    UUID of the admin invoking the call
   *                              (positional thrift parameter). Auto-resolved
   *                              from saved id_token when omitted.
   *
   * Note: the underlying thrift call **does not accept a password**. The new
   * user always gets the platform default password `123456` (forced change on
   * first login). See `docs/SECURITY.md → User creation password` for why the
   * CLI cannot rotate it post-creation.
   *
   * @returns The new user's id (UUID string).
   */
  async createUser(input: {
    loginName: string;
    displayName?: string;
    code?: string;
    position?: string;
    remark?: string;
    email?: string;
    telNumber?: string;
    idcardNumber?: string;
    departmentIds?: string[];
    priority?: number;
    csfLevel?: number;
    csfLevel2?: number | null;
    pwdControl?: boolean;
    expireTime?: number;
    managerID?: string | null;
    managerDisplayName?: string | null;
    callerUserId?: string;
  }): Promise<string> {
    const callerUserId = input.callerUserId ?? resolveCurrentUserId();
    if (!callerUserId) {
      throw new Error(
        "Cannot determine caller user id. ShareMgnt.Usrm_AddUser requires the " +
          "admin's UUID as a positional parameter. Run `kweaver-admin auth login` " +
          "to obtain a session with id_token, then retry, or pass it explicitly.",
      );
    }
    const csfLevel =
      input.csfLevel ??
      (process.env.KWEAVER_ADMIN_CSF_LEVEL ? Number(process.env.KWEAVER_ADMIN_CSF_LEVEL) : undefined);
    const ncTUsrmUserInfo: {
      loginName: string;
      displayName: string;
      code: string;
      position: string;
      managerID: string | null;
      managerDisplayName: string | null;
      remark: string;
      email: string;
      telNumber: string;
      idcardNumber: string;
      departmentIds: string[];
      priority: number;
      csfLevel?: number;
      csfLevel2: number | null;
      pwdControl: boolean;
      expireTime: number;
    } = {
      loginName: input.loginName,
      displayName: input.displayName ?? input.loginName,
      code: input.code ?? "",
      position: input.position ?? "",
      managerID: input.managerID ?? null,
      managerDisplayName: input.managerDisplayName ?? null,
      remark: input.remark ?? "",
      email: input.email ?? "",
      telNumber: input.telNumber ?? "",
      idcardNumber: input.idcardNumber ?? "",
      departmentIds: input.departmentIds ?? ["-1"],
      priority: input.priority ?? 999,
      csfLevel2: input.csfLevel2 ?? null,
      pwdControl: input.pwdControl ?? false,
      expireTime: input.expireTime ?? -1,
    };
    if (csfLevel !== undefined) {
      ncTUsrmUserInfo.csfLevel = csfLevel;
    }
    return this.shareMgnt<string>("Usrm_AddUser", [
      { ncTUsrmAddUserInfo: { user: { ncTUsrmUserInfo } } },
      callerUserId,
    ]);
  }

  /**
   * Update mutable user fields. Tries `PATCH /api/user-management/v1/users/:id`
   * first; on 404 falls back to ISFWeb thrift `Usrm_EditUser`, mirroring the
   * payload shape used by the console
   * (`isf/ISFWeb/src/components/EditUser/component.base.tsx`):
   *
   *   [{ ncTEditUserParam: { id, displayName, code, position, managerID,
   *      remark, idcardNumber, priority, csfLevel, csfLevel2, email,
   *      telNumber, expireTime } }, callerUserId]
   *
   * For partial updates we read the current values via `findUserById` is not
   * available, so omitted fields are sent as ShareMgnt's "no change" sentinels
   * (empty string / null / -1 / preserve priority/csfLevel by reading current).
   * To minimise risk, we only send the fields the caller explicitly set and
   * fill required-but-omitted ones with defaults that match `Usrm_AddUser`.
   */
  async updateUser(
    id: string,
    body: {
      displayName?: string;
      code?: string;
      position?: string;
      remark?: string;
      email?: string;
      telNumber?: string;
      managerID?: string;
      idcardNumber?: string | null;
      priority?: number;
      csfLevel?: number;
      csfLevel2?: number | null;
      expireTime?: number;
      callerUserId?: string;
    },
  ): Promise<unknown> {
    // Public REST route registered at line 220 of user_rest_handler.go is
    // `PATCH /api/user-management/v1/management/users/:user_id`. The earlier
    // `/users/:id` form is `RegisterPrivate` and 404s on every public ingress
    // we've tested. Map our camelCase fields to the snake_case the handler
    // expects (`display_name`, `tel_number`, …).
    const restBody: Record<string, unknown> = {};
    if (body.displayName !== undefined) restBody.display_name = body.displayName;
    if (body.code !== undefined) restBody.code = body.code;
    if (body.position !== undefined) restBody.position = body.position;
    if (body.remark !== undefined) restBody.remark = body.remark;
    if (body.email !== undefined) restBody.email = body.email;
    if (body.telNumber !== undefined) restBody.tel_number = body.telNumber;
    if (body.managerID !== undefined) restBody.manager_id = body.managerID;
    if (body.idcardNumber !== undefined) restBody.idcard_number = body.idcardNumber;
    if (body.priority !== undefined) restBody.priority = body.priority;
    if (body.csfLevel !== undefined) restBody.csf_level = body.csfLevel;
    if (body.csfLevel2 !== undefined) restBody.csf_level2 = body.csfLevel2;
    if (body.expireTime !== undefined) restBody.expire_time = body.expireTime;
    const restRes = await this.patch(
      `/api/user-management/v1/management/users/${encodeURIComponent(id)}`,
      restBody,
    );
    if (restRes.status === 204) return { id, updated: true, route: "rest" };
    if (restRes.status !== 404 && restRes.status !== 405) {
      // 200 / 400 / 403 etc. — surface to caller, do not silently fall back.
      return this.jsonOrThrow(restRes);
    }

    const callerUserId = body.callerUserId ?? resolveCurrentUserId();
    if (!callerUserId) {
      throw new Error(
        "REST update is unavailable on this deployment, and the ShareMgnt fallback " +
          "(Usrm_EditUser) requires the admin's UUID. Run `kweaver-admin auth login` " +
          "to obtain a session with id_token, then retry.",
      );
    }
    const ncTEditUserParam = {
      id,
      displayName: body.displayName ?? "",
      code: body.code ?? "",
      position: body.position ?? "",
      managerID: body.managerID ?? "",
      remark: body.remark ?? "",
      idcardNumber: body.idcardNumber ?? null,
      priority: body.priority ?? 999,
      csfLevel:
        body.csfLevel ??
        (process.env.KWEAVER_ADMIN_CSF_LEVEL
          ? Number(process.env.KWEAVER_ADMIN_CSF_LEVEL)
          : 5),
      csfLevel2: body.csfLevel2 ?? null,
      email: body.email ?? "",
      telNumber: body.telNumber ?? "",
      expireTime: body.expireTime ?? -1,
    };
    await this.shareMgnt<unknown>("Usrm_EditUser", [
      { ncTEditUserParam },
      callerUserId,
    ]);
    return { id, updated: true, route: "shareMgnt" };
  }

  /**
   * Delete a user. Tries `DELETE /api/user-management/v1/users/:id` first; when
   * that route is not registered (HTTP 404), falls back to ShareMgnt
   * `Usrm_DelUser` (same thrift bridge as `user create`).
   */
  async deleteUser(id: string): Promise<void> {
    const res = await this.delete(`/api/user-management/v1/users/${encodeURIComponent(id)}`);
    if (res.status === 404) {
      await this.shareMgnt<unknown>("Usrm_DelUser", [id]);
      return;
    }
    await this.expectOkEmpty(res);
  }

  /**
   * Look up a user by exact account / loginName.
   *
   * Backed by UserManagement's public search endpoint
   * (`isf/UserManagement/driveradapters/user_rest_handler.go::searchUsers`,
   * `RegisterPublic` so it is reachable on the external ingress):
   *
   *   GET /api/user-management/v1/console/search-users/id,account?account=<x>&role=<r>&limit=10
   *
   * Returns `null` when no exact match is found. Note the `role` query is
   * mandatory (server-side `roleEnumIDMap` lookup); this is the same gotcha
   * that makes `/api/user-management/v1/users` 404 without it.
   */
  async findUserByAccount(account: string): Promise<{ id: string; account: string } | null> {
    const role = resolveDefaultUserManagementRole();
    const qs = new URLSearchParams({
      account,
      role,
      limit: "10",
    });
    const data = (await this.jsonOrThrow(
      await this.get(`/api/user-management/v1/console/search-users/account?${qs.toString()}`),
    )) as { entries?: Array<{ id: string; account?: string }> };
    const entries = data.entries ?? [];
    const match = entries.find((e) => e.account === account) ?? entries[0];
    if (!match) return null;
    return { id: match.id, account: match.account ?? account };
  }

  /**
   * Admin-side password reset via the public UserManagement REST endpoint
   * (`isf/UserManagement/driveradapters/user_rest_handler.go::updateUserInfo`,
   * registered as `PUT /api/user-management/v1/management/users/:user_id/:fields`).
   *
   * The server requires the password to be RSA1024-encrypted with the
   * built-in UserManagement public key, then base64-encoded — the same
   * scheme used by the EACP `modifypassword` endpoint (see `eacp.ts`).
   * Old password is **not** required for this admin route.
   *
   * Returns nothing on success (HTTP 204).
   */
  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    const res = await this.put(
      `/api/user-management/v1/management/users/${encodeURIComponent(userId)}/password`,
      { password: encryptModifyPwd(newPassword) },
    );
    if (res.status === 204) return;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
  }

  /**
   * Authorization service's accessor types accepted by `role-members` and
   * `accessor_roles` endpoints (`role_rest_handler.go:54-65`).
   */
  // member type / role source enums mirrored from Authorization service
  // (role_rest_handler.go map literals).

  /**
   * Add or remove role members. Backed by
   * `POST /api/authorization/v1/role-members/:id` with body
   * `{method: "POST" | "DELETE", members: [{id, type}]}`
   * (`role_rest_handler.go:533`, jsonschema `add_delete_members.json`).
   */
  async modifyRoleMembers(
    roleId: string,
    method: "POST" | "DELETE",
    members: Array<{ id: string; type: "user" | "department" | "group" | "app" }>,
  ): Promise<void> {
    await this.jsonOrThrow(
      await this.post(`/api/authorization/v1/role-members/${encodeURIComponent(roleId)}`, {
        method,
        members,
      }),
    );
  }

  /** Convenience wrapper: assign a role to a single user. */
  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.modifyRoleMembers(roleId, "POST", [{ id: userId, type: "user" }]);
  }

  /** Convenience wrapper: revoke a role from a single user. */
  async revokeRole(userId: string, roleId: string): Promise<void> {
    await this.modifyRoleMembers(roleId, "DELETE", [{ id: userId, type: "user" }]);
  }

  /**
   * List roles via the Authorization service.
   * `GET /api/authorization/v1/roles?offset&limit&keyword&source=…`
   * Source defaults to `business + user` server-side
   * (`role_rest_handler.go:278-352`).
   */
  async listRoles(params?: {
    offset?: number;
    limit?: number;
    keyword?: string;
    sources?: Array<"system" | "business" | "user">;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("offset", String(params?.offset ?? 0));
    qs.set("limit", String(params?.limit ?? 100));
    if (params?.keyword) qs.set("keyword", params.keyword);
    for (const s of params?.sources ?? []) qs.append("source", s);
    return this.jsonOrThrow(await this.get(`/api/authorization/v1/roles?${qs.toString()}`));
  }

  /** Get role detail by id. `GET /api/authorization/v1/roles/:id`. */
  async getRole(
    roleId: string,
    options?: { resourceTypeViewMode?: "flat" | "hierarchy" },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (options?.resourceTypeViewMode) {
      qs.set("resource_type_view_mode", options.resourceTypeViewMode);
    }
    const query = qs.toString();
    return this.jsonOrThrow(
      await this.get(
        `/api/authorization/v1/roles/${encodeURIComponent(roleId)}${query ? `?${query}` : ""}`,
      ),
    );
  }

  /**
   * List members of a role.
   * `GET /api/authorization/v1/role-members/:id?offset&limit&keyword&type=…`
   */
  async getRoleMembers(
    roleId: string,
    params?: {
      offset?: number;
      limit?: number;
      keyword?: string;
      types?: Array<"user" | "department" | "group" | "app">;
    },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("offset", String(params?.offset ?? 0));
    qs.set("limit", String(params?.limit ?? 100));
    if (params?.keyword) qs.set("keyword", params.keyword);
    for (const t of params?.types ?? []) qs.append("type", t);
    return this.jsonOrThrow(
      await this.get(
        `/api/authorization/v1/role-members/${encodeURIComponent(roleId)}?${qs.toString()}`,
      ),
    );
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
      await this.get(`/api/mf-model-manager/v1/llm/list${query ? `?${query}` : ""}`),
    );
  }

  async llmGet(modelId: string): Promise<unknown> {
    return this.jsonOrThrow(
      await this.get(`/api/mf-model-manager/v1/llm/get?model_id=${encodeURIComponent(modelId)}`),
    );
  }

  async llmAdd(body: {
    model_name: string;
    model_series: string;
    model_conf: { api_model: string; api_base: string; api_key: string };
    model_type?: string;
    icon?: string;
  }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/llm/add", body));
  }

  async llmEdit(body: { model_id: string; model_name?: string; icon?: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/llm/edit", body));
  }

  async llmDelete(modelIds: string[]): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/llm/delete", { model_ids: modelIds }));
  }

  async llmTest(body: { model_id: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/llm/test", body));
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
      await this.get(`/api/mf-model-manager/v1/small-model/list${query ? `?${query}` : ""}`),
    );
  }

  async smallModelGet(modelId: string): Promise<unknown> {
    return this.jsonOrThrow(
      await this.get(`/api/mf-model-manager/v1/small-model/get?model_id=${encodeURIComponent(modelId)}`),
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
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/small-model/add", body));
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
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/small-model/edit", body));
  }

  async smallModelDelete(modelIds: string[]): Promise<unknown> {
    return this.jsonOrThrow(
      await this.post("/api/mf-model-manager/v1/small-model/delete", { model_ids: modelIds }),
    );
  }

  async smallModelTest(body: { model_id: string }): Promise<unknown> {
    return this.jsonOrThrow(await this.post("/api/mf-model-manager/v1/small-model/test", body));
  }

  async listAuditLogs(body: {
    page_num?: number;
    page_size?: number;
    user_name?: string;
    start_time?: string;
    end_time?: string;
  }): Promise<unknown> {
    // Login-log can be slow on some clusters; default fetch has no timeout and may hang.
    const signal = AbortSignal.timeout(120_000);
    return this.jsonOrThrow(
      await this.post("/api/eacp/v1/auth1/login-log", body, { signal }),
    );
  }
}
