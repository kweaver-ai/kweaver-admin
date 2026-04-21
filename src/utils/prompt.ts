import { createInterface, type Interface } from "node:readline";

/**
 * Prompt the user for a line of input. When `hidden` is true, the typed
 * characters are not echoed (suitable for passwords).
 *
 * Returns the trimmed input. Throws if stdin is not a TTY (cannot reasonably
 * collect a password in non-interactive mode).
 */
export async function promptInput(message: string, opts: { hidden?: boolean } = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `Cannot prompt for "${message.trim()}" — stdin is not a TTY. ` +
        "Pass the value via a flag (e.g. --password) when running non-interactively.",
    );
  }

  process.stdout.write(message);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  let restoreSilence: (() => void) | undefined;
  if (opts.hidden) {
    restoreSilence = silenceOutput(rl);
  }

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.once("line", (line) => resolve(line));
    });
    if (opts.hidden) process.stdout.write("\n");
    return answer.trim();
  } finally {
    restoreSilence?.();
    rl.close();
  }
}

/**
 * Yes/No confirmation prompt; defaults to "no" on bare Enter.
 * Returns false (declined) automatically when stdin is not a TTY.
 */
export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const answer = await promptInput(`${message} [y/N] `);
  return /^y(es)?$/i.test(answer);
}

/**
 * Replace the readline interface's output writer so typed characters are not
 * echoed. Returns a function that restores the original writer.
 *
 * The prompt message MUST be written to stdout BEFORE calling this — once
 * silenced, every subsequent write to `rl.output` (which IS `process.stdout`)
 * is dropped, including any prompt text written via `process.stdout.write`.
 */
function silenceOutput(rl: Interface): () => void {
  const writable = (rl as unknown as { output: NodeJS.WritableStream }).output;
  const originalWrite = writable.write.bind(writable);
  (writable as unknown as { write: (chunk: unknown, ...rest: unknown[]) => boolean }).write = (
    chunk: unknown,
    ...rest: unknown[]
  ) => {
    if (typeof chunk === "string" && chunk.length > 0 && chunk !== "\n" && chunk !== "\r\n") {
      return true;
    }
    return originalWrite(chunk as never, ...(rest as []));
  };
  return () => {
    (writable as unknown as { write: typeof originalWrite }).write = originalWrite;
  };
}
