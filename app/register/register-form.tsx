"use client";

import { useActionState } from "react";
import { register, type RegisterState } from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    register,
    {},
  );

  if (state.confirmEmailSent) {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Check your email to confirm your account, then sign in.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="text-sm font-medium">
        Full name
        <input
          type="text"
          name="fullName"
          autoComplete="name"
          defaultValue={state.fullName}
          required
          className={inputClass}
        />
      </label>

      <label className="text-sm font-medium">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          className={inputClass}
        />
      </label>

      <label className="text-sm font-medium">
        Password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </label>

      <label className="text-sm font-medium">
        Confirm password
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
