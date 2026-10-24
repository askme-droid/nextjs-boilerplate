import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";
import { signOut } from "@/lib/auth/actions";
import { FacebookIcon, InstagramIcon } from "./social-icons";

const topBarLinkClass =
  "text-sm font-medium text-white/90 underline-offset-4 hover:text-white hover:underline";
const mainNavLinkClass =
  "text-sm font-medium text-brand-gray hover:text-brand-teal";
const socialLinkClass = "text-white/90 transition-colors hover:text-white";

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
 * Main bar (always white, not theme-aware): the logo and the primary nav —
 * Home, plus Blog and Contact Us, which live on the main fd.sg site. White
 * regardless of site theme because the logo's tagline text is a
 * semi-transparent gray meant for a light background — confirmed by sampling
 * its actual pixels, it fades into a near-black dark-mode background otherwise.
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
              // Top of every page: load straight away (`priority` is
              // deprecated in Next 16).
              loading="eager"
              fetchPriority="high"
              className="h-[46.8px] w-auto"
            />
          </Link>

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/" className={mainNavLinkClass}>
              Home
            </Link>
            {/* noopener only (no noreferrer): fd.sg is our own site, so its analytics can still see these visits come from here. */}
            <a href="https://www.fd.sg/blog/" target="_blank" rel="noopener" className={mainNavLinkClass}>
              Blog
            </a>
            <a href="https://www.fd.sg/contact-us/" target="_blank" rel="noopener" className={mainNavLinkClass}>
              Contact Us
            </a>
          </div>
        </nav>
      </header>
    </div>
  );
}
