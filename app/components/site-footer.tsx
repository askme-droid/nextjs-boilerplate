import Image from "next/image";
import Link from "next/link";
import { FacebookIcon, InstagramIcon } from "./social-icons";

const headingClass = "text-sm font-semibold uppercase tracking-wide text-brand-gray";
const linkClass = "text-sm text-zinc-600 hover:text-brand-teal hover:underline";
const socialLinkClass = "text-brand-gray transition-colors hover:text-brand-teal";

/**
 * Three-column footer modeled on digital.fd.sg's own: logo, an About Us
 * blurb + social links, and a Guides link list — plus a copyright bar.
 * Always light (like the nav's white main bar), not theme-aware: it sits
 * on the same logo/brand-gray palette that already commits to a light
 * treatment regardless of site theme.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
        <div>
          <Image
            src="/logo.png"
            alt="FDSG"
            width={216}
            height={86}
            className="h-10 w-auto"
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className={headingClass}>About Us</h2>
          <p className="text-sm text-zinc-600">
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

      <div className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-500">
        © {year} FDSG. All rights reserved.
      </div>
    </footer>
  );
}
