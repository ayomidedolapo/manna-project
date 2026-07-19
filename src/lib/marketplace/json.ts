export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function requiredString(value: unknown): string | null {
  const trimmed = optionalString(value);
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function optionalBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  return Boolean(value);
}
