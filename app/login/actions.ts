"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Same message for unknown email and wrong password: don't reveal which.
    if (error.code === "invalid_credentials") {
      return { error: "Invalid email or password.", email };
    }
    if (error.status === 429) {
      return { error: "Too many attempts. Wait a minute and try again.", email };
    }
    return { error: "Could not sign in. Please try again.", email };
  }

  // Outside try/catch: redirect() works by throwing.
  redirect(next);
}
