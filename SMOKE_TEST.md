# KWeaver Admin CLI Smoke Test

Run these commands in repository root:

```bash
# 1) Build
npm run build

# 2) Set base URL (choose one)
export KWEAVER_BASE_URL="https://your-kweaver-host"
# or:
# node dist/index.js config set baseUrl "https://your-kweaver-host"

# (Optional, dev only) Ignore TLS cert verification
# export KWEAVER_TLS_INSECURE=1
# or add -k to commands below

# 3) Provide admin token (choose one)
export KWEAVER_ADMIN_TOKEN="your_admin_token"
# or persist to ~/.kweaver-admin:
# node dist/index.js auth login "https://your-kweaver-host" --token "your_admin_token"

# 4) Auth checks
node dist/index.js auth status
node dist/index.js auth token >/dev/null && echo "token ok"

# 5) Org smoke
node dist/index.js org list --json
node dist/index.js org tree --json

# 6) User smoke
node dist/index.js user list --json
# if you have a user id:
# node dist/index.js user get <userId> --json
# node dist/index.js user roles <userId> --json

# 7) Role smoke
node dist/index.js role list --json

# 8) LLM smoke
node dist/index.js llm list --json

# 9) Small-model smoke
node dist/index.js small-model list --json
```

## Notes

- Default output is plain aligned text (no outer box).
- Add `--json` for machine-readable output.
- `audit list` is currently a stub and not included in this smoke checklist.
