/**
 * Node's built-in `fetch` often rejects with TypeError("fetch failed"); the underlying
 * reason (ECONNREFUSED, certificate, DNS, …) is usually on `error.cause`.
 */
export function formatFetchFailure(url: string, error: unknown): string {
  if (error instanceof Error) {
    const bits: string[] = [error.message];
    const c = error.cause;
    if (c instanceof Error) {
      bits.push(c.message);
      const code = (c as NodeJS.ErrnoException).code;
      if (code) bits.push(`[${code}]`);
    } else if (c !== undefined) {
      bits.push(String(c));
    }
    return `${bits.join(" — ")} (url: ${url})`;
  }
  return `${String(error)} (url: ${url})`;
}
