"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/** Shared by the global nav (app/components/site-nav.tsx) and anywhere else
 *  that needs a sign-out button — always lands back on /login regardless of
 *  which page triggered it. */
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
