"use client";

import { useState, type FormEvent } from "react";

export default function ApiConsoleLoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = identifier.trim();

    if (!value || !password) {
      setError("Enter your email or phone number and password.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const isEmail = value.includes("@");

      const response = await fetch(
        "/api/internal/api-console/auth/login",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password,
            ...(isEmail
              ? { email: value.toLowerCase() }
              : { phone: value }),
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          data?.message ?? "Unable to sign in. Please try again."
        );
        return;
      }

      window.location.assign("/admin/api-console");
    } catch {
      setError("Unable to reach Manna. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-5 py-10 text-white">
      <section className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-2xl font-black text-zinc-950">
            M
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">
            Manna Internal Operations
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight">
            Backend Console
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Restricted access for Manna administrators only.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8"
        >
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-semibold text-zinc-200"
              >
                Email or phone number
              </label>

              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="admin@manna.com or 080..."
                autoComplete="username"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/35 disabled:opacity-60"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-semibold text-zinc-200"
                >
                  Password
                </label>

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>

              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/35 disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-7 w-full rounded-xl bg-white px-4 py-3.5 text-sm font-black text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in to Backend Console"}
          </button>
        </form>
      </section>
    </main>
  );
}