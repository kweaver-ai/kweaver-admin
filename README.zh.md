# kweaver-admin

[English](README.md) | 中文

KWeaver 管理员命令行工具：用户、角色、审计、模型、本地配置。详见 [AGENTS.md](AGENTS.md) 与 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 环境要求

- Node.js 18+

## 快速开始

```bash
npm install
npm run build
node dist/index.js --help
```

全局选项：`--json`、`--base-url <url>`。

## 认证

设置 `KWEAVER_BASE_URL`（或通过 `kweaver-admin config set baseUrl <url>` 写入 `BASE_URL`），以及 `KWEAVER_TOKEN`；或在与 KWeaver CLI 对齐时把 token 放到 `~/.kweaver/token`。

## 文档

产品与设计文档位于 [docs/](docs/) 目录。

## 许可证

Apache-2.0，详见 [LICENSE](LICENSE)。
