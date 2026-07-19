import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  signAuthToken,
  verifyAdminAuthToken,
} from "@/lib/auth";
import { mannaApiRoutes } from "@/lib/api-console/routeRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EXECUTIONS_PER_MINUTE = 40;

const SENSITIVE_KEY =
  /password|secret|token|authorization|cookie|api[_-]?key|signature|pin|otp/i;

type ExecuteBody = {
  routeId?: unknown;
  pathParams?: unknown;
  query?: unknown;
  bodyText?: unknown;
  actorUserId?: unknown;
  reason?: unknown;
  confirmationPhrase?: unknown;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[TRUNCATED_DEPTH]";
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > 4_000
      ? `${value.slice(0, 4_000)}…[TRUNCATED]`
      : value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitize(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    ).slice(0, 100)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : sanitize(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(sanitize(value))
  ) as Prisma.InputJsonValue;
}

function getEnvironment() {
  return (
    process.env.MANNA_APP_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

function isSameOrigin(req: Request) {
  const origin = req.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (value === undefined) {
    return {};
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const output: Record<string, string> = {};

  for (const [key, item] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (typeof item !== "string") {
      return null;
    }

    output[key] = item;
  }

  return output;
}

function asQueryRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined) {
    return {};
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function resolvePath(
  template: string,
  pathParams: Record<string, string>
) {
  const expectedParams = Array.from(
    template.matchAll(/\[([^\]]+)\]/g)
  ).map((match) => match[1]);

  const unexpected = Object.keys(pathParams).filter(
    (key) => !expectedParams.includes(key)
  );

  if (unexpected.length > 0) {
    throw new Error(`Unexpected path parameter: ${unexpected[0]}`);
  }

  return template.replace(/\[([^\]]+)\]/g, (_, name: string) => {
    const value = pathParams[name]?.trim();

    if (!value) {
      throw new Error(`Path parameter "${name}" is required.`);
    }

    return encodeURIComponent(value);
  });
}

function appendQuery(
  targetUrl: URL,
  query: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      targetUrl.searchParams.set(key, String(value));
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          typeof item !== "string" &&
          typeof item !== "number" &&
          typeof item !== "boolean"
        ) {
          throw new Error(
            `Query parameter "${key}" contains an unsupported value.`
          );
        }

        targetUrl.searchParams.append(key, String(item));
      }

      continue;
    }

    throw new Error(
      `Query parameter "${key}" must be text, number, boolean, or array.`
    );
  }
}

function getPaystackModeSecret() {
  const mode = process.env.PAYSTACK_MODE ?? "test";

  const secret =
    mode === "live"
      ? process.env.PAYSTACK_SECRET_KEY_LIVE
      : process.env.PAYSTACK_SECRET_KEY_TEST;

  if (!secret) {
    throw new Error(
      "Paystack secret is not configured for this deployment."
    );
  }

  return secret;
}

function applySystemRouteAuthentication(
  routePath: string,
  targetUrl: URL,
  rawBody: string,
  headers: Headers
) {
  if (routePath === "/api/webhooks/paystack") {
    const signature = crypto
      .createHmac("sha512", getPaystackModeSecret())
      .update(rawBody)
      .digest("hex");

    headers.set("x-paystack-signature", signature);
  }

  if (routePath === "/api/webhooks/payment") {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      throw new Error(
        "PAYSTACK_SECRET_KEY is missing for the legacy payment webhook."
      );
    }

    const signature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    headers.set("x-paystack-signature", signature);
  }

  if (routePath === "/api/webhooks/kwik") {
    const secret = process.env.KWIK_WEBHOOK_SECRET;

    if (!secret) {
      throw new Error("KWIK_WEBHOOK_SECRET is not configured.");
    }

    headers.set("x-kwik-secret", secret);
  }

  if (routePath === "/api/cron/kwik-sync") {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      throw new Error("CRON_SECRET is not configured.");
    }

    targetUrl.searchParams.set("secret", secret);
  }
}

async function readLimitedBody(response: Response) {
  if (!response.body) {
    return { text: "", truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (total + value.byteLength > MAX_RESPONSE_BYTES) {
        const remaining = MAX_RESPONSE_BYTES - total;

        if (remaining > 0) {
          chunks.push(value.slice(0, remaining));
          total += remaining;
        }

        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(merged),
    truncated,
  };
}

function parseResponse(
  contentType: string,
  text: string,
  truncated: boolean
): unknown {
  if (truncated) {
    return {
      preview: text,
      truncated: true,
    };
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return {
        rawResponse: text,
        warning: "Target declared JSON but returned unreadable JSON.",
      };
    }
  }

  return text;
}

export async function POST(req: Request) {
  if (process.env.MANNA_CONSOLE_EXECUTION_ENABLED !== "true") {
    return json(
      {
        ok: false,
        message: "Console execution is disabled on this deployment.",
      },
      403
    );
  }

  const cookieStore = await cookies();

  const adminToken =
    cookieStore.get("manna_admin_token")?.value;

  const adminSession = adminToken
    ? verifyAdminAuthToken(adminToken)
    : null;

  if (!adminSession) {
    return json(
      {
        ok: false,
        message: "Admin console authentication required.",
      },
      401
    );
  }

  const admin = await prisma.user.findUnique({
    where: { id: adminSession.userId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!admin || admin.role !== "ADMIN") {
    return json(
      {
        ok: false,
        message: "Current account no longer has admin access.",
      },
      403
    );
  }

  if (!isSameOrigin(req)) {
    return json(
      {
        ok: false,
        message: "Invalid request origin.",
      },
      403
    );
  }

  const csrfCookie =
    cookieStore.get("manna_admin_csrf")?.value;

  const csrfHeader =
    req.headers.get("x-manna-admin-csrf");

  if (
    !csrfCookie ||
    !csrfHeader ||
    !safeEqual(csrfCookie, csrfHeader)
  ) {
    return json(
      {
        ok: false,
        message:
          "Console security token is invalid. Sign out and sign in again.",
      },
      403
    );
  }

  const contentLength = Number(
    req.headers.get("content-length") ?? 0
  );

  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(
      {
        ok: false,
        message: "Execution request is too large.",
      },
      413
    );
  }

  let input: ExecuteBody;

  try {
    input = (await req.json()) as ExecuteBody;
  } catch {
    return json(
      {
        ok: false,
        message: "Execution request must be valid JSON.",
      },
      400
    );
  }

  const routeId =
    typeof input.routeId === "string"
      ? input.routeId
      : "";

  const bodyText =
    typeof input.bodyText === "string"
      ? input.bodyText
      : "";

  const actorUserId =
    typeof input.actorUserId === "string" &&
    input.actorUserId.trim()
      ? input.actorUserId.trim()
      : admin.id;

  const reason =
    typeof input.reason === "string"
      ? input.reason.trim()
      : "";

  const confirmationPhrase =
    typeof input.confirmationPhrase === "string"
      ? input.confirmationPhrase.trim()
      : "";

  const pathParams = asStringRecord(input.pathParams);
  const query = asQueryRecord(input.query);

  if (!routeId || !pathParams || !query) {
    return json(
      {
        ok: false,
        message: "routeId, pathParams, or query is invalid.",
      },
      400
    );
  }

  if (reason.length < 3 || reason.length > 240) {
    return json(
      {
        ok: false,
        message:
          "Execution reason must be between 3 and 240 characters.",
      },
      400
    );
  }

  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return json(
      {
        ok: false,
        message: "Request body is too large.",
      },
      413
    );
  }

  let parsedBody: unknown;

  if (bodyText.trim()) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return json(
        {
          ok: false,
          message: "Request body must contain valid JSON.",
        },
        400
      );
    }
  }

  const route = mannaApiRoutes.find(
    (item) => item.id === routeId
  );

  if (!route) {
    return json(
      {
        ok: false,
        message: "Route is not present in the Manna route registry.",
      },
      404
    );
  }

  let resolvedPath: string;

  try {
    resolvedPath = resolvePath(route.path, pathParams);
  } catch (error) {
    return json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid path parameters.",
      },
      400
    );
  }

  const requiresConfirmation =
    route.method !== "GET" &&
    route.method !== "HEAD" ||
    route.safety !== "SAFE_READ";

  const expectedConfirmation = `RUN ${route.method} ${resolvedPath}`;

  if (
    requiresConfirmation &&
    confirmationPhrase !== expectedConfirmation
  ) {
    return json(
      {
        ok: false,
        message: `Type exactly: ${expectedConfirmation}`,
      },
      400
    );
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000);

  const recentExecutions =
    await prisma.apiConsoleExecutionLog.count({
      where: {
        adminId: admin.id,
        createdAt: {
          gte: oneMinuteAgo,
        },
      },
    });

  if (recentExecutions >= MAX_EXECUTIONS_PER_MINUTE) {
    return json(
      {
        ok: false,
        message:
          "Execution rate limit reached. Wait a minute before trying again.",
      },
      429
    );
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!actor) {
    return json(
      {
        ok: false,
        message: "Execution actor was not found.",
      },
      404
    );
  }

  const actorToken = signAuthToken(actor.id, actor.role);

  const executionLog =
    await prisma.apiConsoleExecutionLog.create({
      data: {
        adminId: admin.id,
        actorUserId: actor.id,
        routeId: route.id,
        method: route.method,
        path: resolvedPath,
        environment: getEnvironment(),
        reason,
        confirmationPhrase:
          requiresConfirmation
            ? confirmationPhrase
            : null,
        requestPathParams: asJson(pathParams),
        requestQuery: asJson(query),
        ...(parsedBody !== undefined
          ? { requestBody: asJson(parsedBody) }
          : {}),
        outcome: "FAILED",
      },
    });

  const startedAt = Date.now();

  try {
    const targetUrl = new URL(resolvedPath, req.url);

    appendQuery(targetUrl, query);

    const headers = new Headers({
      Accept: "application/json, text/plain, */*",
      Cookie: `manna_token=${actorToken}`,
      "x-manna-api-console-execution": "v1",
    });

    if (
      bodyText &&
      route.method !== "GET" &&
      route.method !== "HEAD"
    ) {
      headers.set("Content-Type", "application/json");
    }

    applySystemRouteAuthentication(
      route.path,
      targetUrl,
      bodyText,
      headers
    );

    const targetResponse = await fetch(targetUrl, {
      method: route.method,
      headers,
      body:
        route.method === "GET" || route.method === "HEAD"
          ? undefined
          : bodyText || undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const contentType =
      targetResponse.headers.get("content-type") ?? "";

    const preview = await readLimitedBody(targetResponse);

    const responseBody = parseResponse(
      contentType,
      preview.text,
      preview.truncated
    );

    await prisma.apiConsoleExecutionLog.update({
      where: { id: executionLog.id },
      data: {
        outcome: targetResponse.ok
          ? "SUCCEEDED"
          : "FAILED",
        statusCode: targetResponse.status,
        durationMs: Date.now() - startedAt,
        responsePreview: asJson({
          truncated: preview.truncated,
          response: responseBody,
        }),
      },
    });

    return json({
      ok: targetResponse.ok,
      executionId: executionLog.id,
      routeId: route.id,
      environment: getEnvironment(),
      targetStatus: targetResponse.status,
      durationMs: Date.now() - startedAt,
      responseTruncated: preview.truncated,
      response: sanitize(responseBody),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Target request failed.";

    await prisma.apiConsoleExecutionLog
      .update({
        where: { id: executionLog.id },
        data: {
          outcome: "FAILED",
          durationMs: Date.now() - startedAt,
          errorMessage: message,
        },
      })
      .catch(() => null);

    return json(
      {
        ok: false,
        executionId: executionLog.id,
        message,
      },
      502
    );
  }
}