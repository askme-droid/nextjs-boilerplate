"use server";

import { APIError } from "better-auth/api";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

export type ResetPasswordState = {
  error?: string;
};

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: "This reset link is invalid or has expired." };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };
  if (newPassword !== confirmPassword) return { error: "Passwords don't match." };

  try {
    await auth.api.resetPassword({ body: { newPassword, token } });
  } catch (e) {
    if (e instanceof APIError) {
      if (e.body?.code === "INVALID_TOKEN") {
        return { error: "This reset link is invalid or has expired." };
      }
      return { error: e.body?.message ?? "Could not reset your password." };
    }
    return { error: "Could not reset your password." };
  }

  redirect("/login?reset=1");
}
