export type FormField =
  | { name: string; kind: "string"; value: string }
  | { name: string; kind: "file"; path: string };

export interface CallInvocation {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
  formFields?: FormField[];
  pretty: boolean;
  verbose: boolean;
  businessDomain: string;
}

export function parseCallArgs(args: string[], defaultBizDomain: string): CallInvocation {
  const headers = new Headers();
  let method = "GET";
  let body: string | undefined;
  const formFields: FormField[] = [];
  let url: string | undefined;
  let pretty = true;
  let verbose = false;
  let businessDomain = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-X" || arg === "--request") {
      method = (args[index + 1] ?? "").toUpperCase();
      index += 1;
      continue;
    }

    if (arg === "-H" || arg === "--header") {
      const header = args[index + 1];
      if (!header) {
        throw new Error("Missing value for header flag");
      }
      const separatorIndex = header.indexOf(":");
      if (separatorIndex === -1) {
        throw new Error(`Invalid header format: ${header}`);
      }
      const name = header.slice(0, separatorIndex).trim();
      const value = header.slice(separatorIndex + 1).trim();
      headers.set(name, value);
      index += 1;
      continue;
    }

    if (arg === "-d" || arg === "--data" || arg === "--data-raw") {
      body = args[index + 1] ?? "";
      if (method === "GET") {
        method = "POST";
      }
      index += 1;
      continue;
    }

    if (arg === "-F" || arg === "--form") {
      const raw = args[index + 1];
      if (!raw) throw new Error("Missing value for -F flag");
      const eq = raw.indexOf("=");
      if (eq === -1) throw new Error(`Invalid -F format: ${raw} (expected key=value or key=@path)`);
      const name = raw.slice(0, eq);
      const rhs = raw.slice(eq + 1);
      if (rhs.startsWith("@")) {
        formFields.push({ name, kind: "file", path: rhs.slice(1) });
      } else {
        formFields.push({ name, kind: "string", value: rhs });
      }
      if (method === "GET") method = "POST";
      index += 1;
      continue;
    }

    if (arg === "--pretty") {
      pretty = true;
      continue;
    }

    if (arg === "--no-pretty") {
      pretty = false;
      continue;
    }

    if (arg === "--json") {
      pretty = true;
      continue;
    }

    if (arg === "-v" || arg === "--verbose") {
      verbose = true;
      continue;
    }

    if (arg === "-bd" || arg === "--biz-domain") {
      businessDomain = args[index + 1] ?? "";
      if (!businessDomain || businessDomain.startsWith("-")) {
        throw new Error("Missing value for biz-domain flag");
      }
      index += 1;
      continue;
    }

    if (arg === "--url") {
      url = args[index + 1];
      index += 1;
      continue;
    }

    if (!arg.startsWith("-") && !url) {
      url = arg;
      continue;
    }

    throw new Error(`Unsupported call argument: ${arg}`);
  }

  if (!url) {
    throw new Error("Missing request URL");
  }

  if (formFields.length > 0 && body !== undefined) {
    throw new Error("-F and -d are mutually exclusive");
  }

  if (!businessDomain) businessDomain = defaultBizDomain;
  return {
    url,
    method,
    headers,
    body,
    formFields: formFields.length > 0 ? formFields : undefined,
    pretty,
    verbose,
    businessDomain,
  };
}

export function injectAuthHeaders(headers: Headers, accessToken: string, businessDomain: string): void {
  if (accessToken) {
    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }

    if (!headers.has("token")) {
      headers.set("token", accessToken);
    }
  }

  if (!headers.has("x-business-domain")) {
    headers.set("x-business-domain", businessDomain);
  }
}

export function formatCallOutput(text: string, pretty: boolean): string {
  if (!pretty || !text) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function stripSseDoneMarker(text: string, contentType?: string | null): string {
  if (!text || !contentType?.includes("text/event-stream")) {
    return text;
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "data: [DONE]");
  return lines.join("\n").trimEnd();
}

export function formatVerboseRequest(invocation: CallInvocation & { url: string }): string[] {
  const lines = [`Method: ${invocation.method}`, `URL: ${invocation.url}`, "Headers:"];

  const entries = Array.from(invocation.headers.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, value] of entries) {
    lines.push(`  ${name}: ${value}`);
  }

  const bodyDesc =
    invocation.formFields && invocation.formFields.length > 0
      ? `multipart (${invocation.formFields.length} field${invocation.formFields.length > 1 ? "s" : ""})`
      : invocation.body
        ? "present"
        : "empty";
  lines.push(`Body: ${bodyDesc}`);
  return lines;
}
