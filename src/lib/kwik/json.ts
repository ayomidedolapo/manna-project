import type { KwikJsonObject } from "./types";

export function isRecord(value: unknown): value is KwikJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function integerNgnFromUnknown(value: unknown): number | null {
  const parsed = numberFromUnknown(value);
  return parsed === null ? null : Math.round(parsed);
}

export function stringFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function dataObject(response: KwikJsonObject): KwikJsonObject {
  const data = response.data;
  return isRecord(data) ? data : {};
}

export function responseStatus(response: KwikJsonObject): number | null {
  return numberFromUnknown(response.status);
}

export function ensureKwikSuccess(response: KwikJsonObject, operation: string): void {
  const status = responseStatus(response);

  if (status !== 200) {
    const message = stringFromUnknown(response.message) ?? "Kwik request failed";
    throw new Error(`${operation} failed: ${message}`);
  }
}

export function jsonArrayOfRecords(value: unknown): KwikJsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}
