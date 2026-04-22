---
name: kweaver-admin
description: Use when managing KWeaver admin operations from CLI, including auth, org, user, role, model, audit, config, and call passthrough; especially when users ask for command parameters, examples, or routing/fallback behavior in kweaver-admin.
---

# KWeaver Admin CLI

## Overview

`kweaver-admin` covers platform administration: authentication, org/user/role,
model config, audit, and raw API passthrough.

This skill uses progressive disclosure:

1. Read this file for command-group selection.
2. Read `references/*.md` for exact command/parameter details.
3. Read routing/fallback reference when debugging deployment differences.

`references/` is the source of truth for this skill. When answering detailed
questions (flags, payload shape, fallback behavior), read the corresponding
reference first, then execute.

## 安装

```bash
npm install -g @kweaver-ai/kweaver-admin
# or
npx -y @kweaver-ai/kweaver-admin --help
```

## 使用方式

```bash
kweaver-admin [--json] [--base-url <url>] [-k] <group> <subcommand> [options]
```

## 命令组总览

| 组 | 说明 | 详细参数 |
|---|---|---|
| `auth` | 登录、状态、whoami、改密、token | [references/auth.md](references/auth.md) |
| `user` | 用户 CRUD、角色绑定、重置密码 | [references/user.md](references/user.md) |
| `org` + `role` | 部门管理、角色与成员管理 | [references/org-role.md](references/org-role.md) |
| `llm` + `small-model` | 模型配置管理与连通性测试 | [references/models.md](references/models.md) |
| `audit` + `config` + `call` | 审计、配置、原始请求透传 | [references/audit-config-call.md](references/audit-config-call.md) |
| 路由与回退 | REST/ShareMgnt 回退和已知异常 | [references/routing-and-fallbacks.md](references/routing-and-fallbacks.md) |

## References 使用规则（关键）

`references/` 是该 skill 的细节层，按以下顺序读取：

1. 先看本文件，决定命令组与执行顺序。
2. 再读对应 `references/*.md`，获取参数和示例。
3. 遇到部署差异（404/501/errID）时，额外读 `routing-and-fallbacks.md`。

当用户问到参数语义、命令细节、实现逻辑时，必须先读对应 reference，再执行。

## 执行策略

1. 先跑只读命令（`list/get/tree/status/whoami`）确认环境。
2. 写操作前记录关键 ID，并优先使用 `--json`。
3. 每次写操作后立刻用读命令验收。
4. 遇到 404/501/errID 错误时，按 routing reference 判断是否是后端可用性差异。

## 触发示例

```text
/kweaver-admin 列出所有用户并按关键词过滤
/kweaver-admin 给用户分配角色并验证结果
/kweaver-admin 创建部门并查看组织树
/kweaver-admin 重置 testcli1 密码到默认值
/kweaver-admin 用 call 检查某个 REST 接口是否可达
```
