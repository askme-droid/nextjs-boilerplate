import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Target status model (draft/pending/published/rejected), already confirmed
// with the user — see the Railway/Drizzle/Better-Auth migration plan.
export const LISTING_STATUSES = ["draft", "pending", "published", "rejected"] as const;

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // confirmed UNIQUE by live testing (categories_slug_key)
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const experienceTags = pgTable("experience_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Not explicitly confirmed unique via testing this session (only
  // categories.slug and listings.slug were tested) — add .unique() here if
  // Phase 4's data migration finds duplicate slugs would violate it; if none
  // exist, adding the constraint is harmless and matches categories' pattern.
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(), // confirmed UNIQUE by live testing (listings_slug_key)
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }), // ON DELETE SET NULL confirmed by live testing
  location: text("location"),
  companyName: text("company_name"),
  companyUen: text("company_uen"),
  socialLinks: text("social_links").array(),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  keywords: text("keywords").array(),
  status: text("status", { enum: LISTING_STATUSES }).notNull().default("draft"),
  featuredImageUrl: text("featured_image_url"),
  // Staff-curated pick for the homepage "Featured listings" section (see
  // getFeaturedVideos in lib/listings/queries.ts). Not to be confused with
  // listing_images.is_featured, which is which *photo* represents a listing.
  homepageFeatured: boolean("homepage_featured").notNull().default(false),
  // Position among the flagged listings (lowest first); managed from
  // /admin/listings/featured. Ties (e.g. everything still at the default 0)
  // fall back to newest first.
  homepageFeaturedOrder: integer("homepage_featured_order").notNull().default(0),
  // The clip shown in the homepage video slider (Vercel Blob URL, uploaded
  // from /admin/listings/featured). The slider is video-only, so a picked
  // listing without one is simply not shown.
  featuredVideoUrl: text("featured_video_url"),
  // Alternative to the video: an image or animated GIF for the homepage
  // slider (R2 URL, uploaded from /admin/listings/featured). A slide has one
  // or the other — setting one clears the other. Not to be confused with
  // featured_image_url, the listing's own photo.
  featuredSlideImageUrl: text("featured_slide_image_url"),
  // Set only for listings syndicated from elsewhere (e.g. fd.sg) that we show
  // in search/browse here but whose actual content stays at the source —
  // the card and the detail route both send visitors there instead of
  // rendering our own copy. Null for every listing that's ours.
  externalUrl: text("external_url"),
  // Set by staff when a client asks for their listing to point at their own
  // landing page/domain. Unlike external_url (which marks a listing as
  // synced from fd.sg and moves it to the Synced admin tab), this is one of
  // our own listings: it stays in search, categories and the admin list as
  // normal, but its card links out and its detail page redirects here.
  redirectUrl: text("redirect_url"),
  // SEO panel (admin listing editor, Yoast-style). All optional: when empty
  // the page falls back to "<title> | FDSG" and the start of the description.
  // seo_title is used as the full <title> as-is (no "| FDSG" suffix added),
  // so the 60-character counter in the editor matches what search shows.
  // focus_keyword is only for the editor's checks — never output as a tag.
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  focusKeyword: text("focus_keyword"),
  // Social share overrides (Open Graph: Facebook, WhatsApp, LinkedIn, X).
  // Empty = fall back to the SEO title/description and the featured photo.
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImageUrl: text("og_image_url"),
  // AEO/GEO (answer engines and AI assistants; admin editor's "Answer engines"
  // panel). quick_answer is a 1–2 sentence factual summary shown at the top of
  // the page; faqs are question/answer pairs shown on the page and marked up
  // as schema.org FAQPage; the offer fields feed the page and the Offer markup.
  quickAnswer: text("quick_answer"),
  faqs: jsonb("faqs").$type<{ q: string; a: string }[]>(),
  offerPrice: numeric("offer_price", { precision: 10, scale: 2 }),
  offerDiscount: text("offer_discount"),
  redemptionInfo: text("redemption_info"),
  // "Who is this for" (one line, e.g. "Parents of P1–Sec 4 students in Bukit
  // Batok") and up to 8 short "key points" bullets — both shown on the page
  // and read by answer engines.
  audience: text("audience"),
  keyPoints: jsonb("key_points").$type<string[]>(),
  // Was uuid FK -> profiles.id under Supabase; Better-Auth's user.id is text,
  // so this column's type changed too (see migration plan). ON DELETE
  // behavior is an assumption (SET NULL — a user's historical listings
  // shouldn't vanish if their account is deleted), not confirmed against the
  // original listings_created_by_fkey, since that specific cascade was never
  // tested this session.
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  // Null = never expires. Otherwise shown through the end of this date in
  // Singapore time, then hidden from the public site (lib/listings/expiry.ts).
  expiresAt: date("expires_at"),
  // How many times the listing page (or its redirect) has been opened by a
  // visitor, ACADP-style. Bots and link prefetches aren't counted. Staff can
  // edit it in admin (e.g. to carry over counts from the old WordPress site).
  viewCount: integer("view_count").notNull().default(0),
  // Last check of company_uen against ACRA's register (data.gov.sg, see
  // lib/business/acra.ts). uen_verified_uen is the UEN that was checked, so
  // changing company_uen afterwards hides the "Verified business" badge until
  // it's checked again. Status is ACRA's own wording ("Live", "Live Company",
  // "Struck Off", ...) or "Not found".
  uenVerifiedUen: text("uen_verified_uen"),
  uenVerifiedName: text("uen_verified_name"),
  uenVerifiedStatus: text("uen_verified_status"),
  uenVerifiedAt: timestamp("uen_verified_at", { withTimezone: true }),
  // published_at is the date visitors see ("Posted 2 days ago", newest first,
  // the New badge). Set when the listing is first published; staff can edit
  // it. For synced listings it's fd.sg's posting date. Null = never published
  // (code falls back to created_at). created_at stays the moment the entry
  // was made and never changes.
  publishedAt: timestamp("published_at", { withTimezone: true }),
  // Set when staff edit the published date, so "Refresh from fd.sg" stops
  // copying fd.sg's date over it.
  publishedDateLocked: boolean("published_date_locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // search_vector intentionally dropped: confirmed via exploration that no
  // query in this app ever reads it (search uses ilike on title/description
  // directly) — it was write-only dead weight under Supabase. Add back as a
  // generated tsvector column + GIN index if full-text search is wanted later.
});

export const listingImages = pgTable("listing_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  // ON DELETE CASCADE is an assumption (standard for a detail/child table),
  // not confirmed against the original constraint.
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  altText: text("alt_text"),
  position: integer("position").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  // CLIP ViT-B/32 image embedding (see lib/listings/embeddings.ts), used for
  // "search by image" nearest-neighbor lookups via pgvector's cosine
  // distance. Null until backfilled/generated — every read path has to
  // tolerate that, not just newly-added images.
  embedding: vector("embedding", { dimensions: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listingExperienceTags = pgTable(
  "listing_experience_tags",
  {
    // ON DELETE CASCADE on both sides is an assumption for this junction
    // table, not confirmed against the original constraints.
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => experienceTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.listingId, table.tagId] })],
);
