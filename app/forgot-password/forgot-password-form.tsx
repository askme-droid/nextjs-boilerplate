"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.sent) {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        If that email has an account, check it for a link to reset your password.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="text-sm font-medium">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
