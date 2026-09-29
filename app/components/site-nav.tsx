import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";
import { signOut } from "@/lib/auth/actions";

const linkClass =
  "text-sm font-medium text-brand-gray underline-offset-4 hover:text-brand-teal hover:underline";

/**
 * Rendered once in the root layout, so it's the same header everywhere —
 * public pages, /my-listings, and /admin (whose own layout no longer
 * duplicates a sign-out/email header). Anonymous visitors get Log in /
 * Register; signed-in ones get My listings, Admin (staff only), their
 * email, and Sign out. Reads the real session (not just the cookie) since
 * it needs the email and role to decide what to show, not just whether a
 * session exists.
 *
 * Always a white background, not theme-aware: the logo's tagline text is a
 * semi-transparent gray meant for a light background (confirmed by sampling
 * its actual pixels — it fades into a near-black dark-mode background), so
 * the header stays light regardless of the visitor's theme, the same way
 * most brand headers do.
 */
export async function SiteNav() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <header className="border-b border-zinc-200 bg-white">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 p-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="FDSG"
            width={216}
            height={86}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          {session ? (
            <>
              <Link href="/my-listings" className={linkClass}>
                My listings
              </Link>
              {isStaff(session.user.role) && (
                <Link href="/admin" className={linkClass}>
                  Admin
                </Link>
              )}
              <span className="text-sm text-brand-gray">
                {session.user.email}
              </span>
              <form action={signOut}>
                <button type="submit" className={linkClass}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={linkClass}>
                Log in
              </Link>
              <Link href="/register" className={linkClass}>
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
