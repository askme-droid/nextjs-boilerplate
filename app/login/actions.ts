"use server";

import { APIError } from "better-auth/api";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { safeNextPath } from "@/lib/auth/safe-redirect";

export type LoginState = { error?: string; email?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  try {
    // nextCookies() (see lib/auth/auth.ts) is what makes this actually log
    // the browser in — without it this call succeeds but sets no cookie.
    await auth.api.signInEmail({ body: { email, password } });
  } catch (e) {
    if (e instanceof APIError) {
      // Same message for unknown email and wrong password — Better-Auth
      // already unifies these into one code, so there's nothing to merge.
      if (e.body?.code === "INVALID_EMAIL_OR_PASSWORD") {
        return { error: "Invalid email or password.", email };
      }
      if (e.body?.code === "EMAIL_NOT_VERIFIED") {
        return { error: "Confirm your email before signing in.", email };
      }
      if (e.status === "TOO_MANY_REQUESTS" || e.statusCode === 429) {
        return { error: "Too many attempts. Wait a minute and try again.", email };
      }
    }
    return { error: "Could not sign in. Please try again.", email };
  }

  // Outside try/catch: redirect() works by throwing.
  redirect(next);
}
