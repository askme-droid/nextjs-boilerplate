import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";
import { signOut } from "@/lib/auth/actions";

const topBarLinkClass =
  "text-sm font-medium text-white/90 underline-offset-4 hover:text-white hover:underline";
const mainNavLinkClass =
  "text-sm font-medium text-brand-gray hover:text-brand-teal";
const socialLinkClass = "text-white/90 transition-colors hover:text-white";

// Simple monochrome glyphs (not the brand-color logos) so they read clearly
// as white icons against the teal top bar, matching how most sites treat
// social links in a colored bar.
function FacebookIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

/**
 * Rendered once in the root layout, so it's the same two-row header
 * everywhere — public pages, /my-listings, and /admin.
 *
 * Top bar (always brand teal): social links, plus the session-dependent
 * account area — Log in/Register when signed out, or My listings/Admin
 * (staff only)/email/Sign out when signed in. Reads the real session (not
 * just the cookie) since it needs the email and role to decide what to
 * show, not just whether a session exists.
 *
 * Main bar (always white, not theme-aware): the logo and the primary nav
 * (Home/About Us/FAQ/Contact Us). White regardless of site theme because
 * the logo's tagline text is a semi-transparent gray meant for a light
 * background — confirmed by sampling its actual pixels, it fades into a
 * near-black dark-mode background otherwise.
 */
export async function SiteNav() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div>
      <div className="bg-brand-teal">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <a
              href="https://www.facebook.com/FDSGDeals"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="FDSG on Facebook"
              className={socialLinkClass}
            >
              <FacebookIcon />
            </a>
            <a
              href="https://www.instagram.com/fdsgdeals/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="FDSG on Instagram"
              className={socialLinkClass}
            >
              <InstagramIcon />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {session ? (
              <>
                <Link href="/my-listings" className={topBarLinkClass}>
                  My listings
                </Link>
                {isStaff(session.user.role) && (
                  <Link href="/admin" className={topBarLinkClass}>
                    Admin
                  </Link>
                )}
                <span className="text-sm text-white/80">{session.user.email}</span>
                <form action={signOut}>
                  <button type="submit" className={topBarLinkClass}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className={topBarLinkClass}>
                  Log in
                </Link>
                <Link href="/register" className={topBarLinkClass}>
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <header className="border-b border-zinc-200 bg-white">
        <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 p-4">
          <Link href="/" className="flex items-center">
            {/* 30% taller than the previous h-9 (36px) size: 36 * 1.3 = 46.8px. */}
            <Image
              src="/logo.png"
              alt="FDSG"
              width={216}
              height={86}
              priority
              className="h-[46.8px] w-auto"
            />
          </Link>

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/" className={mainNavLinkClass}>
              Home
            </Link>
            <Link href="/about" className={mainNavLinkClass}>
              About Us
            </Link>
            <Link href="/faq" className={mainNavLinkClass}>
              FAQ
            </Link>
            <Link href="/contact" className={mainNavLinkClass}>
              Contact Us
            </Link>
          </div>
        </nav>
      </header>
    </div>
  );
}
