import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>

        {token ? (
          <>
            <p className="mb-6 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Choose a new password for your account.
            </p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            This reset link is invalid or has expired.{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              Request a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
