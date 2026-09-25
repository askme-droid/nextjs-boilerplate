"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPassword,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="text-sm font-medium">
        New password
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </label>

      <label className="text-sm font-medium">
        Confirm new password
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
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
