import Image from "next/image";
import Link from "next/link";
import { FacebookIcon, InstagramIcon } from "./social-icons";

const headingClass = "text-sm font-semibold uppercase tracking-wide text-white";
const linkClass = "text-sm text-zinc-300 hover:text-brand-teal hover:underline";
const socialLinkClass = "text-zinc-300 transition-colors hover:text-brand-teal";

/**
 * Three-column footer modeled on digital.fd.sg's own: logo, an About Us
 * blurb + social links, and a Guides link list — plus a copyright bar.
 * Always dark (#18181b) with light text, whatever the site theme. The logo is
 * the transparent footer version (public/logo-footer.png).
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#18181b] text-zinc-300">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
        <div>
          {/* Footer version of the logo (transparent background), as on fd.sg. */}
          <Image
            src="/logo-footer.png"
            alt="FDSG — Fly Further with Targeted Distribution"
            width={216}
            height={86}
            className="h-16 w-auto"
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className={headingClass}>About Us</h2>
          <p className="text-sm text-zinc-300">
            FDSG connects Singapore shoppers with flyer deals, e-vouchers,
            and promotions from local businesses.
          </p>

          <h2 className={`${headingClass} mt-2`}>Follow Us</h2>
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
        </div>

        <div className="flex flex-col gap-3">
          <h2 className={headingClass}>Guides</h2>
          <nav className="flex flex-col gap-2">
            <Link href="/" className={linkClass}>
              Home
            </Link>
            <Link href="/about" className={linkClass}>
              About Us
            </Link>
            <Link href="/faq" className={linkClass}>
              FAQ
            </Link>
            <Link href="/contact" className={linkClass}>
              Contact Us
            </Link>
          </nav>
        </div>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-xs text-zinc-400">
        © {year} FDSG. All rights reserved.
      </div>
    </footer>
  );
}
