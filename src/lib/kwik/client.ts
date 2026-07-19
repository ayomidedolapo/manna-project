import type { KwikJsonObject } from "./types";

export class KwikClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs: number) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  async postJson(path: string, body: KwikJsonObject): Promise<KwikJsonObject> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const parsed = await this.parseJsonResponse(response);
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getJson(path: string, params: URLSearchParams): Promise<KwikJsonObject> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
      });

      const parsed = await this.parseJsonResponse(response);
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseJsonResponse(response: Response): Promise<KwikJsonObject> {
    const text = await response.text();

    if (!text.trim()) {
      return {
        message: response.ok ? "Successful" : response.statusText,
        status: response.status,
        data: {},
      };
    }

    const parsed: unknown = JSON.parse(text);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as KwikJsonObject;
    }

    return {
      message: "Unexpected Kwik response format",
      status: response.status,
      data: parsed,
    };
  }
}
