/**
 * Locate the `call` or `curl` CLI keyword in argv so global flags may appear first
 * (e.g. `kweaver-admin --json call /api/...`).
 *
 * Expects typical Node argv: argv[0]=node, argv[1]=script.
 */
export function indexOfCallSubcommand(argv: string[]): number {
  return argv.findIndex((a, i) => i >= 2 && (a === "call" || a === "curl"));
}
