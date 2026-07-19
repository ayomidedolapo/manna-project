type JsonLike = Record<string, unknown> | unknown[];

function isJsonLike(value: unknown): value is JsonLike {
  return typeof value === "object" && value !== null;
}

function findByKeys(value: unknown, keys: string[]): unknown {
  if (!isJsonLike(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findByKeys(item, keys);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }

  for (const nestedValue of Object.values(value)) {
    const found = findByKeys(nestedValue, keys);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

export function extractStringFromKwikPayload(
  payload: unknown,
  keys: string[]
): string | null {
  const value = findByKeys(payload, keys);

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function extractNumberFromKwikPayload(
  payload: unknown,
  keys: string[]
): number | null {
  const value = findByKeys(payload, keys);

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function parseKwikWebhookBody(rawBody: string): unknown {
  if (rawBody.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return { rawBody };
  }
}
