import type { KwikConfig } from "./types";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getKwikConfig(): KwikConfig {
  return {
    baseUrl: optionalEnv("KWIK_BASE_URL") ?? "https://staging-api-test.kwik.delivery",
    domainName: requiredEnv("KWIK_DOMAIN_NAME"),
    accessToken: requiredEnv("KWIK_ACCESS_TOKEN"),
    vendorId: numberEnv("KWIK_VENDOR_ID", 0),
    userId: numberEnv("KWIK_USER_ID", 1),
    formId: numberEnv("KWIK_FORM_ID", 2),
    paymentMethod: numberEnv("KWIK_PAYMENT_METHOD", 524288),
    timezoneOffsetMinutes: numberEnv("KWIK_TIMEZONE_OFFSET_MINUTES", -60),
    customFieldTemplate: optionalEnv("KWIK_CUSTOM_FIELD_TEMPLATE") ?? "pricing-template",
    defaultVehicleId: numberEnv("KWIK_DEFAULT_VEHICLE_ID", 1),
    defaultVehicleName: optionalEnv("KWIK_DEFAULT_VEHICLE_NAME") ?? "Default vehicle",
    quoteTtlMinutes: numberEnv("KWIK_QUOTE_TTL_MINUTES", 10),
    requestTimeoutMs: numberEnv("KWIK_REQUEST_TIMEOUT_MS", 15000),
    serviceAreaId: optionalEnv("KWIK_SERVICE_AREA_ID"),
  };
}

export function assertKwikConfig(config: KwikConfig): void {
  if (config.vendorId <= 0) {
    throw new Error("KWIK_VENDOR_ID must be configured as a positive number");
  }

  if (config.userId <= 0) {
    throw new Error("KWIK_USER_ID must be configured as a positive number");
  }

  if (config.formId <= 0) {
    throw new Error("KWIK_FORM_ID must be configured as a positive number");
  }

  if (config.defaultVehicleId <= 0) {
    throw new Error("KWIK_DEFAULT_VEHICLE_ID must be configured as a positive number");
  }
}
