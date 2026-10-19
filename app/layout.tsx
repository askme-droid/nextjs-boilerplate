import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/app/components/site-footer";
import { SiteNav } from "@/app/components/site-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://directories.fd.sg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FDSG — Flyer deals, e-vouchers and promotions in Singapore",
    template: "%s | FDSG",
  },
  description:
    "Browse flyer deals, e-vouchers and promotions from local Singapore businesses — search by category, location or keyword.",
  // Proves to Google Search Console that this site is ours.
  verification: { google: "kw9aRWmRLg8noEH0ZXMY2rxxp8_vSJk2CbIA-7iigok" },
  openGraph: {
    siteName: "FDSG",
    type: "website",
    locale: "en_SG",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
