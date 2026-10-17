import { createFileRoute } from "@tanstack/react-router";
import type { FieldInfo } from "@/lib/automation/types";

function readFields(raw: unknown): FieldInfo[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 200).map((f: unknown) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const s = (k: string, max: number) => (typeof x[k] === "string" ? (x[k] as string).slice(0, max) : "");
    return {
      key: s("key", 120),
      label: s("label", 200),
      tag: s("tag", 20),
      type: s("type", 30),
      name: s("name", 120),
      id: s("id", 120),
      required: x.required === true,
      options: Array.isArray(x.options) ? x.options.slice(0, 400).map((o) => String(o).slice(0, 200)) : undefined,
    };
  });
}

/**
 * Runtime fallback when a recipe cannot place a field or pick an option.
 * `fields`: labels and key names only. `option`: a public office name and the dropdown's options.
 */
async function handle(request: Request): Promise<Response> {
  const { withDevice, str } = await import("@/lib/automation/runner-http.server");
  const { mapFields, mapOption } = await import("@/lib/automation/mapper.server");
  const { JobError } = await import("@/lib/automation/rows.server");
  return withDevice(request, async (_device, body) => {
    if (!process.env.XAI_API_KEY) throw new JobError("AI is not connected on the server.", 503);
    const recipeId = str(body.recipeId, 60);
    if (body.kind === "option") {
      const options = (Array.isArray(body.options) ? body.options : []).slice(0, 400).map((o) => String(o).slice(0, 200));
      return mapOption({ recipeId, wanted: str(body.wanted, 300), options });
    }
    const keys = (Array.isArray(body.keys) ? body.keys : []).slice(0, 40).map((k: unknown) => {
      const x = (k ?? {}) as Record<string, unknown>;
      return { key: String(x.key ?? "").slice(0, 60), description: String(x.description ?? "").slice(0, 200) };
    });
    return { mapping: await mapFields({ recipeId, keys, fields: readFields(body.fields) }) };
  });
}

export const Route = createFileRoute("/api/runner/map")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
