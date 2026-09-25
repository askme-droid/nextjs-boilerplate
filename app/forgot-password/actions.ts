"use server";

import { auth } from "@/lib/auth/auth";

export type ForgotPasswordState = {
  sent?: boolean;
  email?: string;
};

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (email) {
    // Errors are intentionally swallowed: Better-Auth already returns the
    // same generic response whether or not the email exists (anti-
    // enumeration, see the register flow's onExistingUserSignUp comment) —
    // this mirrors that by always showing the same confirmation.
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } }).catch(() => {});
  }

  return { sent: true, email };
}
