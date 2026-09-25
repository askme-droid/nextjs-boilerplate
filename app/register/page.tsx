import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create an account",
};

export default async function RegisterPage() {
  // Already signed in: skip the form.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Register to submit and manage your own listings.
        </p>
        <RegisterForm />
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
