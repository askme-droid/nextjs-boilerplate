"use server";

import { APIError } from "better-auth/api";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

export type RegisterState = {
  error?: string;
  /** Set on success instead of redirecting, since email verification is
   *  required before a session exists — see the comment below. */
  confirmEmailSent?: boolean;
  fullName?: string;
  email?: string;
};

export async function register(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!fullName || !email || !password) {
    return { error: "Fill in every field.", fullName, email };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", fullName, email };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match.", fullName, email };
  }

  try {
    await auth.api.signUpEmail({ body: { email, password, name: fullName } });
  } catch (e) {
    if (e instanceof APIError) {
      if (e.body?.code === "PASSWORD_TOO_SHORT" || e.body?.code === "PASSWORD_TOO_LONG") {
        return { error: "That password isn't a usable length.", fullName, email };
      }
      return { error: e.body?.message ?? "Could not create your account.", fullName, email };
    }
    return { error: "Could not create your account.", fullName, email };
  }

  // Note: this same "check your email" response is shown whether the email
  // was genuinely new or already registered — Better-Auth's own
  // anti-enumeration design (see onExistingUserSignUp in lib/auth/auth.ts),
  // confirmed by testing directly against this project's API: a duplicate
  // attempt creates no second row, and looks identical to a real signup from
  // the caller's side. There is deliberately no code here trying to
  // distinguish the two cases, unlike the old Supabase version, which had to
  // check `identities.length === 0` because Supabase's version of this
  // protection isn't as complete (the real account holder wasn't notified).
  return { confirmEmailSent: true };
}
