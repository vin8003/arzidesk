/**
 * Tiny JSON Schema builders for xAI structured outputs (strict mode).
 * Zod stays the lenient parser behind these; the schema only steers generation.
 */
export type JsonSchema = Record<string, unknown>;

export const str = (description?: string): JsonSchema =>
  description ? { type: "string", description } : { type: "string" };
export const bool = (): JsonSchema => ({ type: "boolean" });
export const strEnum = (values: readonly string[], description?: string): JsonSchema =>
  description ? { type: "string", enum: [...values], description } : { type: "string", enum: [...values] };
export const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });
export const list = (items: JsonSchema, description?: string): JsonSchema =>
  description ? { type: "array", items, description } : { type: "array", items };

export function obj(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
    ...(description ? { description } : {}),
  };
}

/** `text` field for POST /v1/responses. */
export function responsesJsonFormat(name: string, schema: JsonSchema) {
  return { format: { type: "json_schema" as const, name, schema, strict: true } };
}

/** `response_format` field for POST /v1/chat/completions. */
export function chatJsonFormat(name: string, schema: JsonSchema) {
  return { type: "json_schema" as const, json_schema: { name, schema, strict: true } };
}
