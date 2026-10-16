/** Shapes and readers for xAI replies. Request code (endpoint, auth, body) stays at each call site. */

export type XaiOutputItem = {
  type?: string;
  action?: { query?: string; type?: string };
  queries?: string[];
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ url?: string }>;
  }>;
};

export type XaiResponse = {
  status?: string;
  error?: { message?: string } | string | null;
  output?: XaiOutputItem[];
  citations?: string[];
  output_text?: string;
};

export type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
};

export class XaiHttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`xAI API error ${status}${body ? `: ${body.slice(0, 180)}` : ""}`);
    this.status = status;
  }
}

export function asErrorMessage(error: XaiResponse["error"]): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  return error.message ?? null;
}

/** Text, search queries and retrieved URLs from a /v1/responses reply. */
export function collectFromOutput(data: XaiResponse): { text: string; queries: string[]; urls: string[] } {
  const queries: string[] = [];
  const urls = new Set<string>(data.citations ?? []);
  let text = data.output_text ?? "";
  // output_text already concatenates the message blocks when present.
  const haveText = Boolean(text);
  for (const item of data.output ?? []) {
    if (item.action?.query) queries.push(item.action.query);
    if (Array.isArray(item.queries)) queries.push(...item.queries);
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block.text && !haveText) text += block.text;
        for (const ann of block.annotations ?? []) {
          if (ann.url) urls.add(ann.url);
        }
      }
    }
  }
  return { text, queries: [...new Set(queries)], urls: [...urls] };
}

export function chatText(data: ChatResponse): string {
  return data.choices?.[0]?.message?.content ?? "";
}
