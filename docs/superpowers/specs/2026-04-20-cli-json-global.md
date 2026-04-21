# CLI: global `--json` and machine-readable output

> **Date:** 2026-04-20  
> **Status:** Implemented  
> **Related:** [AGENTS.md](../../../AGENTS.md) (CLI conventions), [ARCHITECTURE.md](../../../ARCHITECTURE.md).

---

## Summary

- **Root option:** `kweaver-admin` registers `--json` on the top-level `Commander` program (`src/index.ts`). Subcommands that need JSON output must read it with **`optsWithGlobals()`**, not `program.opts()` on the leaf command alone — otherwise a user invoking `kweaver-admin --json user list` will see table output. This matches the same class of bug as **`--base-url`** (see `resolveCliBaseUrl` / `optsWithGlobals` usage elsewhere).
- **Helpers:** [`src/lib/cli-json.ts`](../../../src/lib/cli-json.ts) exposes `wantsJsonOutput(program)` (uses `optsWithGlobals`) and `wantsJsonFromArgv(argv)` for code paths that never call `program.parse()` (`call` / `curl`).
- **`call` / `curl`:** These subcommands are dispatched before Commander runs (`indexOfCallSubcommand` in [`src/lib/call-route.ts`](../../../src/lib/call-route.ts)). Arguments after the `call` keyword are passed to `runCallCommand`; global `--json` remains in `process.argv` and is detected via `wantsJsonFromArgv`. [`parseCallArgs`](../../../src/lib/call-invocation.ts) also accepts `--json` as an alias for pretty-printing the response body (JSON when applicable).
- **Tests:** [`src/lib/__tests__/cli-json.test.ts`](../../../src/lib/__tests__/cli-json.test.ts), [`src/lib/__tests__/call-route.test.ts`](../../../src/lib/__tests__/call-route.test.ts), and `parseCallArgs` coverage in [`src/lib/__tests__/call-invocation.test.ts`](../../../src/lib/__tests__/call-invocation.test.ts).

---

## Files

| File | Role |
|------|------|
| `src/lib/cli-json.ts` | `wantsJsonOutput`, `wantsJsonFromArgv` |
| `src/lib/call-route.ts` | `indexOfCallSubcommand` (testable argv routing) |
| `src/index.ts` | Registers `--json`; routes `call`/`curl` before `program.parse()` |
| `src/commands/*.ts` | Subcommand actions use `wantsJsonOutput(program)` |
| `src/commands/call.ts` | Pretty output when global or local `--json` |

---

## Verification

```bash
npm run typecheck
npm test
npm run build
./dist/index.js --json user list
./dist/index.js --json call /api/authorization/v1/roles -X GET
```

---

## Pitfall (documented in tests)

On a subcommand action, `this.opts().json` is **not** the global `--json`. Always use `wantsJsonOutput(rootProgram)` where `rootProgram` is the program instance that registered `.option("--json", ...)`.
