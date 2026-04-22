import {
  constants as cryptoConstants,
  createPrivateKey,
  createPublicKey,
  publicEncrypt,
  type KeyObject,
} from "node:crypto";
import { normalizeBaseUrl } from "./oauth";
import { runWithTlsInsecure } from "./tls";
import { resolveDefaultUserManagementRole } from "./user-management-role";

/**
 * Best-effort fetch of the current user's display info via EACP ShareServer
 * userinfo endpoint. Mirrors `kweaver-sdk` `fetchDisplayName`:
 *
 *   GET /api/eacp/v1/user/get
 *   Authorization: Bearer <access_token>
 *
 * Returns the first non-empty of `account` / `name` / `mail`. Returns
 * undefined on any error so callers can fall back gracefully.
 */
export async function fetchEacpDisplayName(
  baseUrl: string,
  accessToken: string,
  tlsInsecure?: boolean,
): Promise<string | undefined> {
  try {
    const url = `${normalizeBaseUrl(baseUrl)}/api/eacp/v1/user/get`;
    const res = await runWithTlsInsecure(tlsInsecure === true, () =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }),
    );
    if (!res.ok) return undefined;
    const info = (await res.json()) as Record<string, unknown>;
    if (typeof info.account === "string" && info.account.trim()) return info.account.trim();
    if (typeof info.name === "string" && info.name.trim()) return info.name.trim();
    if (typeof info.mail === "string" && info.mail.trim()) return info.mail.trim();
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Best-effort lookup of an account/login name by user UUID via UserManagement
 * public batch endpoint. Used as a fallback when EACP `user/get` is blocked
 * by the per-product client filter (HTTP 401 from `ncEACUserHandler`).
 *
 *   GET /api/user-management/v1/users/<id>/account?role=<role>
 *   -> [{ "account": "<loginName>", "id": "<uuid>", "type": "user" }]
 *
 * `:fields=account` is one of the public-only fields documented in
 * `isf/UserManagement/driveradapters/user_rest_handler.go::handlerOutUserDBInfoRange`.
 */
export async function fetchAccountByUserId(
  baseUrl: string,
  accessToken: string,
  userId: string,
  tlsInsecure?: boolean,
  role?: string,
): Promise<string | undefined> {
  try {
    const qs = new URLSearchParams({ role: role ?? resolveDefaultUserManagementRole() });
    const url = `${normalizeBaseUrl(baseUrl)}/api/user-management/v1/users/${encodeURIComponent(
      userId,
    )}/account?${qs.toString()}`;
    const res = await runWithTlsInsecure(tlsInsecure === true, () =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }),
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as Array<{ account?: string; id?: string }> | unknown;
    if (!Array.isArray(data)) return undefined;
    const match = data.find((e) => e?.id === userId) ?? data[0];
    const account = match?.account;
    return typeof account === "string" && account.trim() ? account.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 1024-bit RSA private key embedded in ShareServer
 * (`isf/ShareServer/src/eachttpserver/ncEACHttpServerUtil.cpp`, function
 * `ncEACHttpServerUtil::RSADecrypt`). It is the keypair used by the EACP
 * `auth1/modifypassword` endpoint to decrypt `oldpwd` / `newpwd`.
 *
 * Note: this key is intentionally hard-coded in the C++ binary and shipped to
 * every customer; it is not a secret. We embed it here so the CLI can perform
 * the matching `RSA_PKCS1` encryption without contacting the server.
 */
const EACP_MODIFYPWD_PRIVATE_KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIICXgIBAAKBgQDB2fhLla9rMx+6LWTXajnK11Kdp520s1Q+TfPfIXI/7G9+L2YC
4RA3M5rgRi32s5+UFQ/CVqUFqMqVuzaZ4lw/uEdk1qHcP0g6LB3E9wkl2FclFR0M
+/HrWmxPoON+0y/tFQxxfNgsUodFzbdh0XY1rIVUIbPLvufUBbLKXHDPpwIDAQAB
AoGBALCM/H6ajXFs1nCR903aCVicUzoS9qckzI0SIhIOPCfMBp8+PAJTSJl9/ohU
YnhVj/kmVXwBvboxyJAmOcxdRPWL7iTk5nA1oiVXMer3Wby+tRg/ls91xQbJLVv3
oGSt7q0CXxJpRH2oYkVVlMMlZUwKz3ovHiLKAnhw+jEsdL2BAkEA9hA97yyeA2eq
f9dMu/ici99R3WJRRtk4NEI4WShtWPyziDg48d3SOzYmhEJjPuOo3g1ze01os70P
ApE7d0qcyQJBAMmt+FR8h5MwxPQPAzjh/fTuTttvUfBeMiUDrIycK1I/L96lH+fU
i4Nu+7TPOzExnPeGO5UJbZxrpIEUB7Zs8O8CQQCLzTCTGiNwxc5eMgH77kVrRudp
Q7nv6ex/7Hu9VDXEUFbkdyULbj9KuvppPJrMmWZROw04qgNp02mayM8jeLXZAkEA
o+PM/pMn9TPXiWE9xBbaMhUKXgXLd2KEq1GeAbHS/oY8l1hmYhV1vjwNLbSNrH9d
yEP73TQJL+jFiONHFTbYXwJAU03Xgum5mLIkX/02LpOrz2QCdfX1IMJk2iKi9osV
KqfbvHsF0+GvFGg18/FXStG9Kr4TjqLsygQJT76/MnMluw==
-----END RSA PRIVATE KEY-----`;

let cachedPubKey: KeyObject | undefined;

function getModifyPwdPublicKey(): KeyObject {
  if (!cachedPubKey) {
    cachedPubKey = createPublicKey(createPrivateKey(EACP_MODIFYPWD_PRIVATE_KEY_PEM));
  }
  return cachedPubKey;
}

/** Encrypt a password with EACP modifypassword's RSA public key, base64-encoded. */
export function encryptModifyPwd(plain: string, publicKeyPem?: string): string {
  const key = publicKeyPem ? createPublicKey(publicKeyPem) : getModifyPwdPublicKey();
  const buf = publicEncrypt(
    { key, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(plain, "utf8"),
  );
  return buf.toString("base64");
}

export interface EacpModifyPasswordOptions {
  account: string;
  /** Optional for the "forgot password" flow; required when changing a known password. */
  oldPassword?: string;
  newPassword: string;
  /** Override the embedded RSA public key (PEM). */
  publicKeyPem?: string;
  /** Verification code (for forget-password / vcode flows). */
  vcode?: { uuid: string; code: string };
  isForgetPwd?: boolean;
  emailAddress?: string;
  telNumber?: string;
  /** Skip TLS certificate verification (matches saved platform setting). */
  tlsInsecure?: boolean;
}

export interface EacpModifyPasswordResult {
  status: number;
  ok: boolean;
  body: string;
  json?: unknown;
}

/**
 * Call EACP `POST /api/eacp/v1/auth1/modifypassword` to change a user's password.
 *
 * Wire format and crypto are derived from `ncEACAuthHandler::ModifyPassword`
 * (`isf/ShareServer/src/eachttpserver/auth/ncEACAuthHandler.cpp`):
 * - `oldpwd`/`newpwd` = base64( RSA_PKCS1_encrypt(plaintext) ) using the embedded keypair.
 * - `vcodeinfo` and `isforgetpwd` are required by the JSON parser even when unused.
 * - When `enable_eacp_check_sign=true` is configured server-side, callers must also
 *   add `?userid=<id>&sign=md5(body+userid+"eisoo.com")` query parameters; this
 *   helper does NOT sign by default (matches the typical deployment).
 *
 * No bearer token / cookie is required — the endpoint authenticates by old password.
 */
export async function eacpModifyPassword(
  baseUrl: string,
  options: EacpModifyPasswordOptions,
): Promise<EacpModifyPasswordResult> {
  const body: Record<string, unknown> = {
    account: options.account,
    oldpwd: options.oldPassword
      ? encryptModifyPwd(options.oldPassword, options.publicKeyPem)
      : "",
    newpwd: encryptModifyPwd(options.newPassword, options.publicKeyPem),
    vcodeinfo: {
      uuid: options.vcode?.uuid ?? "",
      vcode: options.vcode?.code ?? "",
    },
    isforgetpwd: options.isForgetPwd ?? false,
  };
  if (options.isForgetPwd) {
    if (options.emailAddress) body.emailaddress = options.emailAddress;
    if (options.telNumber) body.telnumber = options.telNumber;
  }

  const url = `${normalizeBaseUrl(baseUrl)}/api/eacp/v1/auth1/modifypassword`;
  const resp = await runWithTlsInsecure(options.tlsInsecure === true, () =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await resp.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    /* not JSON */
  }
  return { status: resp.status, ok: resp.ok, body: text, json };
}
