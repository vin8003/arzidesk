import { pullJson } from "@/lib/ai/json";
import { DEFAULT_FAST_MODEL, fastModel, isReasoningModel } from "@/lib/ai/models";
import { REPAIR_NOTE, sendWithFallback } from "@/lib/ai/retry";
import { responsesJsonFormat, type JsonSchema } from "@/lib/ai/schema";
import { XaiHttpError, asErrorMessage, collectFromOutput, type XaiResponse } from "@/lib/ai/xai-response";
import {
  MAPPER_SCHEMA,
  MAPPER_SYSTEM,
  mapperUser,
  OPTION_SCHEMA,
  OPTION_SYSTEM,
  optionUser,
  readMapping,
  readOptionPick,
  type MapperRequest,
  type Mapping,
  type OptionRequest,
} from "./match";

/**
 * Runtime fallback for a live filing whose page moved: Grok maps form
 * controls to payload keys (or a ministry name to a dropdown option). Same
 * xAI call shape as the drafts. Input is labels, options and key names, never
 * citizen data; the answer is checked against the real controls.
 */

const TIMEOUT_MS = 25_000;

async function ask(tag: string, system: string, user: string, schemaName: string, schema: JsonSchema): Promise<unknown> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("AI_UNAVAILABLE");
  const model = fastModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const send = async (body: object): Promise<string> => {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new XaiHttpError(res.status, await res.text().catch(() => ""));
    const payload = (await res.json()) as XaiResponse;
    const err = asErrorMessage(payload.error);
    if (err) throw new Error(err);
    return collectFromOutput(payload).text;
  };
  try {
    const { value } = await sendWithFallback({
      tag,
      send,
      build: ({ legacy, repair }) => {
        const m = legacy ? DEFAULT_FAST_MODEL : model;
        const input: Array<{ role: "user" | "assistant"; content: string }> = [{ role: "user", content: user }];
        if (repair) input.push({ role: "assistant", content: repair.previous.slice(0, 2000) }, { role: "user", content: REPAIR_NOTE });
        return {
          model: m,
          instructions: system,
          input,
          ...(isReasoningModel(m) ? {} : { temperature: 0 }),
          max_output_tokens: 1200,
          text: legacy ? { format: { type: "json_object" as const } } : responsesJsonFormat(schemaName, schema),
        };
      },
      parse: (text) => {
        const v = pullJson(text);
        if (!v || typeof v !== "object") throw new Error("PARSE");
        return v;
      },
      deadline: Date.now() + TIMEOUT_MS,
      minRetryMs: 6_000,
    });
    return value;
  } finally {
    clearTimeout(timer);
  }
}

export async function mapFields(req: MapperRequest): Promise<Mapping> {
  const raw = await ask("map-fields", MAPPER_SYSTEM, mapperUser(req), "field_mapping", MAPPER_SCHEMA as unknown as JsonSchema);
  return readMapping(raw, req);
}

export async function mapOption(req: OptionRequest): Promise<{ option: string | null; confidence: number }> {
  const raw = await ask("map-option", OPTION_SYSTEM, optionUser(req), "option_pick", OPTION_SCHEMA as unknown as JsonSchema);
  return readOptionPick(raw, req);
}
