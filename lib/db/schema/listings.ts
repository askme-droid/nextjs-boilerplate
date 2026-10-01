import {
  boolean,
  date,
  integer,
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
  // Set only for listings syndicated from elsewhere (e.g. fd.sg) that we show
  // in search/browse here but whose actual content stays at the source —
  // the card and the detail route both send visitors there instead of
  // rendering our own copy. Null for every listing that's ours.
  externalUrl: text("external_url"),
  // Was uuid FK -> profiles.id under Supabase; Better-Auth's user.id is text,
  // so this column's type changed too (see migration plan). ON DELETE
  // behavior is an assumption (SET NULL — a user's historical listings
  // shouldn't vanish if their account is deleted), not confirmed against the
  // original listings_created_by_fkey, since that specific cascade was never
  // tested this session.
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  expiresAt: date("expires_at"),
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
