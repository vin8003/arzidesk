/** Pull the outermost JSON object out of a model reply (fenced, prefixed or with trailing commas). */
export function pullJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // fall through to the slice
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("PARSE");
  const slice = raw.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    throw new Error("PARSE");
  }
}
