import type { ApiMethod } from "./routeRegistry";

export type MannaRuntimeEnvironment =
  | "development"
  | "staging"
  | "production";

export type ApiConsoleExecutionPolicy = {
  routeId: string;
  expectedMethod: ApiMethod;
  expectedPath: string;

  enabled: boolean;
  mode: "READ_ONLY";

  allowedEnvironments: readonly MannaRuntimeEnvironment[];
  allowedPathParams: readonly string[];

  maxExecutionsPerMinute: number;
  maxResponseBytes: number;
};

const policies: Record<string, ApiConsoleExecutionPolicy> = {
  "products-list-get": {
    routeId: "products-list-get",
    expectedMethod: "GET",
    expectedPath: "/api/products",
    enabled: true,
    mode: "READ_ONLY",
    allowedEnvironments: [
      "development",
      "staging",
      "production",
    ],
    allowedPathParams: [],
    maxExecutionsPerMinute: 12,
    maxResponseBytes: 128 * 1024,
  },

  "products-detail-get": {
    routeId: "products-detail-get",
    expectedMethod: "GET",
    expectedPath: "/api/products/[slug]",
    enabled: true,
    mode: "READ_ONLY",
    allowedEnvironments: [
      "development",
      "staging",
      "production",
    ],
    allowedPathParams: ["slug"],
    maxExecutionsPerMinute: 12,
    maxResponseBytes: 128 * 1024,
  },

  "discounts-active-get": {
    routeId: "discounts-active-get",
    expectedMethod: "GET",
    expectedPath: "/api/discounts/active",
    enabled: true,
    mode: "READ_ONLY",
    allowedEnvironments: [
      "development",
      "staging",
      "production",
    ],
    allowedPathParams: [],
    maxExecutionsPerMinute: 12,
    maxResponseBytes: 128 * 1024,
  },
};

export function getApiConsoleExecutionPolicy(
  routeId: string
): ApiConsoleExecutionPolicy | undefined {
  return policies[routeId];
}