import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
        <ForgotPasswordForm />
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
