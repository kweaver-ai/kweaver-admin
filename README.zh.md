# kweaver-admin

[English](README.md) | 中文

KWeaver 平台管理员命令行工具：登录与凭证、组织/部门、用户、角色、模型、审计、任意 HTTP（`call`）以及本地配置。命令树见 [ARCHITECTURE.md](ARCHITECTURE.md)，令牌与安全见 [docs/SECURITY.md](docs/SECURITY.md)。

## 环境要求

- **Node.js 18+**

## 安装（全局）

从 npm 安装发布包后，可直接使用 `kweaver-admin` 命令（需保证全局 `bin` 在 `PATH` 中）：

```bash
npm install -g @kweaver-ai/kweaver-admin
```

验证：

```bash
kweaver-admin --version
kweaver-admin --help
```

**说明：** npm 包内已包含构建好的 `dist/`，日常使用**不必**克隆本仓库。

### 其他包管理器

```bash
pnpm add -g @kweaver-ai/kweaver-admin
# 或
yarn global add @kweaver-ai/kweaver-admin
```

## 安装 Agent Skill

将本仓库的 `kweaver-admin` skill 安装到本地 skills 运行时：

```bash
npx skills add https://github.com/kweaver-ai/kweaver-admin --skill kweaver-admin
```

安装后可在支持 skill 加载的 Agent 工作流中直接使用。

### 从源码开发

```bash
git clone https://github.com/kweaver-ai/kweaver-admin.git
cd kweaver-admin
npm install
npm run build
node dist/index.js --help
# 可选：npm link  →  在 PATH 上使用 kweaver-admin
```

## 认证

1. **交互式登录（推荐）：** 指定平台根地址，在浏览器完成登录或使用粘贴码流程：

   ```bash
   kweaver-admin auth login https://your-platform.example/
   ```

2. **无界面 / CI：** 设置环境变量（与常见 KWeaver 工具命名一致）：

   - `KWEAVER_BASE_URL` — 平台 API 根地址  
   - `KWEAVER_TOKEN` 或 `KWEAVER_ADMIN_TOKEN` — 访问令牌（Bearer）  

3. **持久配置：** `kweaver-admin config set baseUrl <url>` 会将默认项写入 `~/.kweaver-admin/`；通过 `auth login` 获得的令牌也会按平台保存在该目录下。

查看当前会话：

```bash
kweaver-admin auth status
kweaver-admin auth whoami
```

`auth whoami` 的优先级：

- 显式传入的 `auth whoami <url>`
- 环境变量 `KWEAVER_BASE_URL` + `KWEAVER_TOKEN` / `KWEAVER_ADMIN_TOKEN`
- 本地保存的 `currentPlatform`

## 全局选项

以下选项写在子命令之前（`call` / `curl` 的用法以各自主页说明为准）：

| 选项 | 作用 |
|------|------|
| `--json` | 在支持的子命令中输出 JSON |
| `--base-url <url>` | 本次执行覆盖 API 根地址 |
| `-k`, `--insecure` | 跳过 TLS 校验（仅开发环境；不安全） |

示例：

```bash
kweaver-admin --json org list
kweaver-admin --base-url https://other.example/ user list
```

## 命令说明（完整子命令）

使用 `kweaver-admin <分组> --help` 查看完整参数与示例。

### `auth`

- `auth login [url]` — 登录平台（默认浏览器 OAuth2；也支持 `--token`、无浏览器、用户名密码流程）。
- `auth logout` — 清除当前平台的本地令牌。
- `auth status` — 查看 baseUrl、token 来源、TLS 模式和会话状态。
- `auth whoami [url]` — 从保存的 `id_token` 解码当前身份。
- `auth list`（别名 `auth ls`） — 列出 `~/.kweaver-admin/platforms` 下所有已保存会话的平台，`*` 标识当前激活平台，并展示 token 状态（valid / expired / refreshable / no-expiry）。
- `auth change-password [url]` — 通过 EACP 接口改密。已登录时 `-u/--account` 默认取当前会话身份（修改自己密码）；未传 `-o/-n` 时在 TTY 上隐藏式提示输入。CLI 不实现忘记密码 / 验证码流程，请到 Web 控制台找回密码。
- `auth token` — 将当前 token 打印到 stdout（敏感信息）。

### `org`

- `org list` — 分页列出部门（支持 `--name`、`--offset`、`--limit`）。
- `org tree` — 以树形文本展示部门层级。
- `org get <id>` — 查看单个部门完整 JSON。
- `org create` — 通过 ISFWeb `Usrm_AddDepartment` thrift 路径创建部门。
- `org update <id>` — 通过 ISFWeb `Usrm_EditDepartment` thrift 路径更新部门。
- `org delete <id>` — 通过 management API 删除部门。
- `org members <id>` — 查看部门成员（`--fields` 可选 `users`/`departments`/`users,departments`）。

`org` 命令通常需要 `--role`（例如 `super_admin`、`org_manager`、`normal_user`），且必须与账号实际权限一致。

### `user`

- `user list` — 查询/列出用户（支持 `--org`、`--keyword`、`--offset`、`--limit`）。
- `user get <id>` — 按 id 查询用户详情。
- `user create` — 通过 ISFWeb `Usrm_AddUser` thrift 路径创建用户。
- `user update <id>` — 更新用户字段（可用时走 REST PATCH，不可用时回退到 ISFWeb 编辑 thrift）。
- `user delete <id>` — 删除用户。
- `user roles <id>` — 查看用户已分配角色。
- `user assign-role <userId> <roleId>` — 为用户分配已有角色。
- `user reset-password` — 管理员重置密码（支持交互输入/默认密码/确认）。
- `user revoke-role <userId> <roleId>` — 撤销用户角色。

### `role`

- `role list` — 列出角色（支持 source/keyword/分页过滤）。
- `role get <id>` — 查看角色详情（资源范围与操作）。
- `role members <roleId>` — 列出角色成员。
- `role add-member <roleId>` — 向角色添加一个或多个成员。
- `role remove-member <roleId>` — 从角色移除一个或多个成员。

### `llm`

- `llm list` — 列出大模型配置。
- `llm get <modelId>` — 查看单个大模型配置。
- `llm add` — 新增大模型配置。
- `llm edit <modelId>` — 编辑大模型配置。
- `llm delete <modelId...>` — 删除一个或多个大模型。
- `llm test <modelId>` — 测试大模型可用性。

### `small-model`

- `small-model list` — 列出小模型配置。
- `small-model get <modelId>` — 查看单个小模型配置。
- `small-model add` — 新增小模型配置。
- `small-model edit <modelId>` — 编辑小模型配置。
- `small-model delete <modelId...>` — 删除一个或多个小模型。
- `small-model test <modelId>` — 测试小模型可用性。

### `audit`

- `audit list` — 查询登录审计事件（支持 `--user`、`--start`、`--end`、分页）。

### `config`

- `config show` — 查看当前 `~/.kweaver-admin/config.json`。
- `config set <key> <value>` — 设置配置项（当前支持 `baseUrl`）。

### `call` / `curl`

- `call <url> ...flags` — 发送带认证头的原始 HTTP 请求（curl 风格参数：`-X`、`-H`、`-d`、`-F`、`-v`、`-bd`、`--pretty`）。
- `curl <url> ...flags` — `call` 的别名。
- 支持 `kweaver-admin --json call ...` 这种全局参数在前的写法。

## 文档

- [ARCHITECTURE.md](ARCHITECTURE.md) — 模块与命令树  
- [AGENTS.md](AGENTS.md) — 贡献者 / Agent 工作流  
- [docs/](docs/) — 产品说明与安全  

## 许可证

Apache-2.0，详见 [LICENSE](LICENSE)。
