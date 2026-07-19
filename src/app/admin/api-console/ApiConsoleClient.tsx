"use client";

import { useMemo, useState } from "react";
import ExecutionPanel from "./ExecutionPanel";
import {
  mannaApiRoutes,
  type ApiMethod,
  type ApiRouteDefinition,
  type RouteSafety,
} from "@/lib/api-console/routeRegistry";

const methodStyles: Record<ApiMethod, string> = {
  GET: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  POST: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  PUT: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  PATCH: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  DELETE: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  HEAD: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
  OPTIONS: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
};

const safetyStyles: Record<RouteSafety, string> = {
  SAFE_READ: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  CONTROLLED_ACTION: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  RESTRICTED_SYSTEM: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

const safetyLabel: Record<RouteSafety, string> = {
  SAFE_READ: "Safe read",
  CONTROLLED_ACTION: "Controlled action",
  RESTRICTED_SYSTEM: "Restricted system",
};

function prettyJson(value: unknown) {
  if (!value) return "No example is documented yet.";

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function MethodBadge({ method }: { method: ApiMethod }) {
  return (
    <span
      className={`inline-flex min-w-14 justify-center rounded-md border px-2 py-1 text-[11px] font-black tracking-wide ${methodStyles[method]}`}
    >
      {method}
    </span>
  );
}

function SafetyBadge({ safety }: { safety: RouteSafety }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${safetyStyles[safety]}`}
    >
      {safetyLabel[safety]}
    </span>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <h2 className="mb-3 text-sm font-bold tracking-wide text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function ApiConsoleClient() {
  const [selectedId, setSelectedId] = useState(mannaApiRoutes[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All modules");
  const [methodFilter, setMethodFilter] = useState<"ALL" | ApiMethod>("ALL");

  const modules = useMemo(
    () => ["All modules", ...Array.from(new Set(mannaApiRoutes.map((route) => route.module)))],
    []
  );

  const filteredRoutes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return mannaApiRoutes.filter((route) => {
      const matchesModule =
        moduleFilter === "All modules" || route.module === moduleFilter;

      const matchesMethod =
        methodFilter === "ALL" || route.method === methodFilter;

      const searchable = [
        route.title,
        route.path,
        route.module,
        route.method,
        route.auth,
        route.description,
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        !normalizedQuery || searchable.includes(normalizedQuery);

      return matchesModule && matchesMethod && matchesQuery;
    });
  }, [moduleFilter, methodFilter, query]);

  const selectedRoute =
    mannaApiRoutes.find((route) => route.id === selectedId) ??
    filteredRoutes[0] ??
    mannaApiRoutes[0];

  const safeReadCount = mannaApiRoutes.filter(
    (route) => route.safety === "SAFE_READ"
  ).length;

  const controlledActionCount = mannaApiRoutes.filter(
    (route) => route.safety === "CONTROLLED_ACTION"
  ).length;

  const restrictedCount = mannaApiRoutes.filter(
    (route) => route.safety === "RESTRICTED_SYSTEM"
  ).length;

  if (!selectedRoute) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-6 text-white">
        No Manna API routes have been registered yet.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
              Manna Internal Operations
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white">
              Backend Console
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Route catalogue, safety guide, execution workspace, and developer handover record.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-center">
              <p className="text-lg font-black text-emerald-300">{safeReadCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200/70">
                Safe reads
              </p>
            </div>

            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-center">
              <p className="text-lg font-black text-amber-300">{controlledActionCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/70">
                Actions
              </p>
            </div>

            <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-2 text-center">
              <p className="text-lg font-black text-rose-300">{restrictedCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-rose-200/70">
                Restricted
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1700px] gap-6 px-5 py-6 lg:grid-cols-[310px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">
              Search endpoints
            </label>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search path, method, module..."
              className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/30"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">
              Module
            </label>

            <select
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
            >
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
              Method
            </p>

            <div className="flex flex-wrap gap-2">
              {(["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"] as const).map(
                (method) => {
                  const active = methodFilter === method;

                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setMethodFilter(method)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                        active
                          ? "border-white bg-white text-zinc-950"
                          : "border-white/10 bg-zinc-900 text-zinc-400 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      {method}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-sm font-bold text-white">
                Routes ({filteredRoutes.length})
              </p>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filteredRoutes.map((route) => {
                const active = route.id === selectedRoute.id;

                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => setSelectedId(route.id)}
                    className={`mb-1 w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-white/25 bg-white/10"
                        : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <MethodBadge method={route.method} />
                      <span className="truncate text-xs font-semibold text-zinc-400">
                        {route.module}
                      </span>
                    </div>

                    <p className="truncate text-sm font-bold text-white">
                      {route.title}
                    </p>

                    <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">
                      {route.path}
                    </p>
                  </button>
                );
              })}

              {filteredRoutes.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">
                  No route matches your filter.
                </p>
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <MethodBadge method={selectedRoute.method} />
                  <SafetyBadge safety={selectedRoute.safety} />

                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      selectedRoute.documentationStatus === "VERIFIED"
                        ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
                        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
                    }`}
                  >
                    {selectedRoute.documentationStatus === "VERIFIED"
                      ? "Verified documentation"
                      : "Needs source review"}
                  </span>
                </div>

                <h2 className="text-2xl font-black tracking-tight text-white">
                  {selectedRoute.title}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  {selectedRoute.description}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Access
                </p>
                <p className="mt-1 font-semibold text-white">{selectedRoute.auth}</p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                Endpoint
              </p>

              <code className="block overflow-x-auto whitespace-nowrap font-mono text-sm text-zinc-100">
                {selectedRoute.method} {selectedRoute.path}
              </code>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Source file
                </p>
                <code className="mt-2 block break-all font-mono text-xs text-zinc-300">
                  {selectedRoute.sourceFile}
                </code>
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Intended use
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {selectedRoute.usage}
                </p>
              </div>
            </div>
          </div>

          {selectedRoute.pathParams && selectedRoute.pathParams.length > 0 && (
            <DetailSection title="Path parameters">
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-3 border-b border-white/10 bg-zinc-900 px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  <span>Name</span>
                  <span>Description</span>
                  <span>Example</span>
                </div>

                {selectedRoute.pathParams.map((param) => (
                  <div
                    key={param.name}
                    className="grid grid-cols-[1fr_1.5fr_1fr] gap-3 border-b border-white/5 px-4 py-3 text-sm last:border-b-0"
                  >
                    <code className="font-mono text-sky-300">{param.name}</code>
                    <span className="text-zinc-300">{param.description}</span>
                    <code className="truncate font-mono text-zinc-400">{param.example}</code>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <DetailSection title="Request body example">
              <textarea
                readOnly
                value={prettyJson(selectedRoute.requestExample)}
                className="min-h-72 w-full resize-y rounded-xl border border-white/10 bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-300 outline-none"
              />
            </DetailSection>

            <DetailSection title="Response example">
              <textarea
                readOnly
                value={prettyJson(selectedRoute.responseExample)}
                className="min-h-72 w-full resize-y rounded-xl border border-white/10 bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-300 outline-none"
              />
            </DetailSection>
          </div>

          <DetailSection title="Developer notes and operational rules">
            <ul className="space-y-3">
              {selectedRoute.notes.map((note) => (
                <li
                  key={note}
                  className="flex gap-3 text-sm leading-6 text-zinc-300"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </DetailSection>

          <ExecutionPanel route={selectedRoute} />
        </section>
      </div>
    </main>
  );
}