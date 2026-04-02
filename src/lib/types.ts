/**
 * System role UUIDs (deploy-web / platform).
 * @see docs/references/deploy-web-roles.txt
 */
export const SystemRoleType = {
  Supper: "7dcfcc9c-ad02-11e8-aa06-000c29358ad6",
  Admin: "d2bd2082-ad03-11e8-aa06-000c29358ad6",
  Securit: "d8998f72-ad03-11e8-aa06-000c29358ad6",
  Audit: "def246f2-ad03-11e8-aa06-000c29358ad6",
  OrgManager: "e63e1c88-ad03-11e8-aa06-000c29358ad6",
  PortalManager: "6da85392c000-60aa-8e11-30da-88c1e36e",
  OrgAudit: "f06ac18e-ad03-11e8-aa06-000c29358ad6",
  SharedApprove: "f58622b2-ad03-11e8-aa06-000c29358ad6",
  DocApprove: "fb648fac-ad03-11e8-aa06-000c29358ad6",
  CsfApprove: "01a78ac2-ad04-11e8-aa06-000c29358ad6",
} as const;

export type SystemRoleId = (typeof SystemRoleType)[keyof typeof SystemRoleType];

/** String roles returned by APIs / deploy-web UserRole */
export const UserRole = {
  Super: "super_admin",
  Admin: "sys_admin",
  Security: "sec_admin",
  Audit: "audit_admin",
  OrgManager: "org_manager",
  OrgAudit: "org_audit",
  NormalUser: "normal_user",
} as const;

export type UserRoleString = (typeof UserRole)[keyof typeof UserRole];

/** Maps system UUID -> user role string (subset used by CLI docs). */
export const SysUserRoles: Partial<Record<SystemRoleId, UserRoleString>> = {
  [SystemRoleType.Supper]: UserRole.Super,
  [SystemRoleType.Admin]: UserRole.Admin,
  [SystemRoleType.Securit]: UserRole.Security,
  [SystemRoleType.Audit]: UserRole.Audit,
  [SystemRoleType.OrgManager]: UserRole.OrgManager,
  [SystemRoleType.OrgAudit]: UserRole.OrgAudit,
};

export interface TokenConfig {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  insecure?: boolean;
}

export interface ClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface AdminState {
  currentPlatform?: string;
}

export interface OrgUnit {
  id: string;
  name: string;
  parentId?: string;
  children?: OrgUnit[];
}

export interface User {
  id: string;
  login: string;
  displayName?: string;
  email?: string;
  orgId?: string;
  roles?: string[];
  createTime?: string;
  updateTime?: string;
}

export interface LlmModel {
  model_id: string;
  model_name: string;
  model_series: string;
  model_type: string;
  model_conf: {
    api_model: string;
    api_base: string;
    api_key: string;
  };
  icon?: string;
  create_time?: string;
  update_time?: string;
}

export interface SmallModel {
  model_id: string;
  model_name: string;
  model_type: "embedding" | "reranker";
  model_config: {
    api_url: string;
    api_model: string;
    api_key?: string;
  };
  batch_size?: number;
  max_tokens?: number;
  embedding_dim?: number;
  create_time?: string;
  update_time?: string;
}
