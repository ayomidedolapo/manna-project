"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiRouteDefinition } from "@/lib/api-console/routeRegistry";

type ExecutionResult = {
  ok: boolean;
  message?: string;
  executionId?: string;
  routeId?: string;
  environment?: string;
  targetStatus?: number;
  durationMs?: number;
  responseTruncated?: boolean;
  response?: unknown;
};

function getCookie(name: string) {
  const prefix = `${name}=`;

  for (const item of document.cookie.split(";")) {
    const value = item.trim();

    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }

  return null;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function resolvePath(
  template: string,
  values: Record<string, string>
) {
  return template.replace(
    /\[([^\]]+)\]/g,
    (_, name: string) =>
      values[name]?.trim()
        ? encodeURIComponent(values[name])
        : `[${name}]`
  );
}

export default function ExecutionPanel({
  route,
}: {
  route: ApiRouteDefinition;
}) {
  const [pathParams, setPathParams] =
    useState<Record<string, string>>({});

  const [queryText, setQueryText] = useState("{}");
  const [bodyText, setBodyText] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] =
    useState("");

  const [error, setError] = useState("");
  const [result, setResult] =
    useState<ExecutionResult | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    const nextParams: Record<string, string> = {};

    for (const parameter of route.pathParams ?? []) {
      nextParams[parameter.name] = "";
    }

    setPathParams(nextParams);
    setQueryText("{}");
    setBodyText(
      route.requestExample
        ? prettyJson(route.requestExample)
        : ""
    );
    setActorUserId("");
    setReason("");
    setConfirmationPhrase("");
    setError("");
    setResult(null);
  }, [route.id, route.pathParams, route.requestExample]);

  const resolvedPath = useMemo(
    () => resolvePath(route.path, pathParams),
    [route.path, pathParams]
  );

  const requiresConfirmation =
    (route.method !== "GET" &&
      route.method !== "HEAD") ||
    route.safety !== "SAFE_READ";

  const expectedConfirmation = `RUN ${route.method} ${resolvedPath}`;

  async function runRoute() {
    setError("");
    setResult(null);

    const missingParam = (route.pathParams ?? []).find(
      (item) => !pathParams[item.name]?.trim()
    );

    if (missingParam) {
      setError(
        `Enter a value for "${missingParam.name}" first.`
      );
      return;
    }

    if (reason.trim().length < 3) {
      setError(
        "Enter a short execution reason for the audit record."
      );
      return;
    }

    let query: Record<string, unknown>;

    try {
      query = queryText.trim()
        ? JSON.parse(queryText)
        : {};
    } catch {
      setError("Query parameters must be valid JSON.");
      return;
    }

    if (
      query === null ||
      typeof query !== "object" ||
      Array.isArray(query)
    ) {
      setError("Query parameters must be a JSON object.");
      return;
    }

    if (bodyText.trim()) {
      try {
        JSON.parse(bodyText);
      } catch {
        setError("Request body must be valid JSON.");
        return;
      }
    }

    if (
      requiresConfirmation &&
      confirmationPhrase.trim() !== expectedConfirmation
    ) {
      setError(`Type exactly: ${expectedConfirmation}`);
      return;
    }

    const csrfToken = getCookie("manna_admin_csrf");

    if (!csrfToken) {
      setError(
        "Security session missing. Sign out and sign in again."
      );
      return;
    }

    setIsExecuting(true);

    try {
      const response = await fetch(
        "/api/internal/api-console/execute",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-manna-admin-csrf": csrfToken,
          },
          body: JSON.stringify({
            routeId: route.id,
            pathParams,
            query,
            bodyText,
            actorUserId: actorUserId.trim() || undefined,
            reason: reason.trim(),
            confirmationPhrase:
              confirmationPhrase.trim() || undefined,
          }),
        }
      );

      const payload = (await response
        .json()
        .catch(() => null)) as ExecutionResult | null;

      if (!response.ok || !payload) {
        setError(
          payload?.message ??
            "The execution service could not run this route."
        );
        return;
      }

      setResult(payload);
    } catch {
      setError(
        "Unable to reach the execution service. Try again."
      );
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.04] p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-bold text-sky-200">
            Execute route
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-sky-100/70">
            This runs against the current Manna deployment only.
            Staging executes staging. Production executes production.
          </p>
        </div>

        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-200">
          {route.documentationStatus === "VERIFIED"
            ? "Documented"
            : "Unreviewed route"}
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-zinc-950 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
          Request
        </p>

        <code className="mt-2 block break-all font-mono text-sm text-white">
          {route.method} {resolvedPath}
        </code>
      </div>

      {(route.pathParams ?? []).length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {route.pathParams?.map((parameter) => (
            <div key={parameter.name}>
              <label className="mb-2 block text-sm font-semibold text-zinc-200">
                {parameter.name}
              </label>

              <input
                value={pathParams[parameter.name] ?? ""}
                onChange={(event) =>
                  setPathParams((current) => ({
                    ...current,
                    [parameter.name]: event.target.value,
                  }))
                }
                placeholder={parameter.example}
                disabled={isExecuting}
                className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30"
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <label className="mb-2 block text-sm font-semibold text-zinc-200">
          Query parameters JSON
        </label>

        <textarea
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          disabled={isExecuting}
          spellCheck={false}
          className="min-h-28 w-full rounded-xl border border-white/10 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 outline-none focus:border-white/30"
        />
      </div>

      {route.method !== "GET" &&
        route.method !== "HEAD" && (
          <div className="mt-5">
            <label className="mb-2 block text-sm font-semibold text-zinc-200">
              JSON request body
            </label>

            <textarea
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              disabled={isExecuting}
              spellCheck={false}
              placeholder='{"example":"value"}'
              className="min-h-56 w-full rounded-xl border border-white/10 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-white/30"
            />
          </div>
        )}

      <div className="mt-5">
        <label className="mb-2 block text-sm font-semibold text-zinc-200">
          Execute as user ID <span className="text-zinc-500">(optional)</span>
        </label>

        <input
          value={actorUserId}
          onChange={(event) => setActorUserId(event.target.value)}
          placeholder="Leave blank to execute as the current console admin"
          disabled={isExecuting}
          className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30"
        />

        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Use a customer UUID only when you need to test a customer-only route.
        </p>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-sm font-semibold text-zinc-200">
          Execution reason
        </label>

        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={240}
          placeholder="Example: Verify checkout response after payment update"
          disabled={isExecuting}
          className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30"
        />
      </div>

      {requiresConfirmation && (
        <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <p className="text-sm font-bold text-amber-200">
            Confirmation required
          </p>

          <p className="mt-1 text-xs leading-5 text-amber-100/70">
            This route may create, change, send, dispatch, cancel,
            charge, or synchronize real data.
          </p>

          <code className="mt-3 block break-all rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-amber-200">
            {expectedConfirmation}
          </code>

          <input
            value={confirmationPhrase}
            onChange={(event) =>
              setConfirmationPhrase(event.target.value)
            }
            placeholder="Type the phrase above exactly"
            disabled={isExecuting}
            className="mt-3 w-full rounded-xl border border-amber-400/20 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-300/50"
          />
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={runRoute}
        disabled={isExecuting}
        className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isExecuting ? "Executing..." : "Execute route"}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              result.ok
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border-rose-400/25 bg-rose-400/10 text-rose-200"
            }`}
          >
            Status: <strong>{result.targetStatus ?? "Unknown"}</strong>
            {result.environment && (
              <> · Environment: <strong>{result.environment}</strong></>
            )}
            {typeof result.durationMs === "number" && (
              <> · Duration: <strong>{result.durationMs}ms</strong></>
            )}
          </div>

          <pre className="max-h-[460px] overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-4 text-xs leading-6 text-zinc-300">
            {prettyJson(result.response)}
          </pre>
        </div>
      )}
    </section>
  );
}