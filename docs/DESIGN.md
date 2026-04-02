# Design overview

kweaver-admin is a thin CLI over KWeaver HTTP APIs. It does not embed business logic that belongs on the server (authorization, audit policy). It focuses on:

- Ergonomic commands for operators and automation
- Consistent auth and configuration
- Clear mapping to System Console capabilities (deploy-web reference)

See [ARCHITECTURE.md](../ARCHITECTURE.md) for structure and [design-docs/](design-docs/) for principles.
