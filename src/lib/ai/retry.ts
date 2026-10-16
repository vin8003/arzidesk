/**
 * Request helpers that sit around the existing xAI fetch at each call site.
 * They never change the endpoint or auth; they only decide whether to try again.
 */

export const REPAIR_NOTE =
  "Your previous reply was not a valid JSON object for the required format. Reply again with ONLY the JSON object, starting with {.";

/** A request-shape rejection (bad schema, unknown model, unsupported param) — worth one retry with the legacy body. */
export function isShapeRejection(status: number): boolean {
  return status === 400 || status === 404 || status === 422;
}

/**
 * Run `call`, and if `parse` throws, run it once more with `repair: true` so the
 * call site can append REPAIR_NOTE. Timeouts and HTTP errors are not retried here;
 * `call` throws those and they propagate. The retry is skipped when less than
 * `minRetryMs` of the budget is left.
 */
export async function withRepairRetry<T>(opts: {
  call: (attempt: { repair: boolean }) => Promise<string>;
  parse: (text: string) => T;
  deadline?: number;
  minRetryMs?: number;
  now?: () => number;
}): Promise<{ value: T; retried: boolean }> {
  const now = opts.now ?? Date.now;
  const first = await opts.call({ repair: false });
  try {
    return { value: opts.parse(first), retried: false };
  } catch (err) {
    const left = opts.deadline === undefined ? Infinity : opts.deadline - now();
    if (left < (opts.minRetryMs ?? 0)) throw err;
  }
  const second = await opts.call({ repair: true });
  return { value: opts.parse(second), retried: true };
}

/**
 * The full retry policy around one call site's own fetch:
 * 1. `send(build({ legacy: false }))`. If xAI rejects the request shape (400/404/422,
 *    raised by `send` as an error with a numeric `status`), resend once with
 *    `build({ legacy: true })` — the pre-upgrade request — and keep using it.
 * 2. If `parse` throws, resend once with `repair` set (see withRepairRetry).
 */
export async function sendWithFallback<T>(opts: {
  tag: string;
  send: (body: object) => Promise<string>;
  build: (attempt: { legacy: boolean; repair?: { previous: string } }) => object;
  parse: (text: string) => T;
  deadline?: number;
  minRetryMs?: number;
}): Promise<{ value: T; retried: boolean; legacy: boolean }> {
  let legacy = false;
  let lastText = "";
  const call = async ({ repair }: { repair: boolean }): Promise<string> => {
    const body = () => opts.build({ legacy, repair: repair ? { previous: lastText } : undefined });
    try {
      lastText = await opts.send(body());
    } catch (err) {
      const status = (err as { status?: unknown } | null)?.status;
      if (legacy || typeof status !== "number" || !isShapeRejection(status)) throw err;
      console.warn(`[${opts.tag}] ${(err as Error).message}; retrying with legacy request`);
      legacy = true;
      lastText = await opts.send(body());
    }
    return lastText;
  };
  const result = await withRepairRetry({
    call,
    parse: opts.parse,
    deadline: opts.deadline,
    minRetryMs: opts.minRetryMs,
  });
  return { ...result, legacy };
}

/** Chat-completions messages with the repair turn appended when asked. */
export function withRepairTurn<M extends { role: string; content: unknown }>(
  messages: M[],
  repair?: { previous: string },
): Array<M | { role: "assistant" | "user"; content: string }> {
  if (!repair) return messages;
  return [
    ...messages,
    { role: "assistant", content: repair.previous.slice(0, 4000) },
    { role: "user", content: REPAIR_NOTE },
  ];
}
