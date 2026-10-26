import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { boolean, createdAt, id } from "./types";

// The flyer images scrolling in the homepage header (hero) strip, managed at
// /admin/hero. Ordered by position (lowest first); hidden ones are kept but
// not shown.
export const heroSlides = sqliteTable("hero_slides", {
  id: id(),
  // An uploaded file (R2), a file in /public (the original built-in slides),
  // or any https image address.
  imageUrl: text("image_url").notNull(),
  // Describes the flyer for screen readers and search engines.
  altText: text("alt_text").notNull().default(""),
  // Optional: where clicking the flyer goes (a listing page or any site).
  linkUrl: text("link_url"),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});
