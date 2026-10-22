// Lists database columns the code expects but the database doesn't have yet
// (a database change that hasn't been run). Read-only.
//
//   node --env-file=.env.local scripts/check-db.mjs
import postgres from "postgres";

const EXPECTED = "hero_slides.id,hero_slides.image_url,hero_slides.alt_text,hero_slides.link_url,hero_slides.position,hero_slides.active,hero_slides.created_at,listing_images.id,listing_images.listing_id,listing_images.url,listing_images.alt_text,listing_images.position,listing_images.is_featured,listing_images.created_at,listing_images.embedding,listings.id,listings.title,listings.slug,listings.description,listings.category_id,listings.location,listings.keywords,listings.status,listings.featured_image_url,listings.created_by,listings.expires_at,listings.created_at,listings.updated_at,listings.company_name,listings.company_uen,listings.social_links,listings.cta_label,listings.cta_url,listings.external_url,listings.homepage_featured,listings.homepage_featured_order,listings.featured_video_url,listings.redirect_url,listings.seo_title,listings.seo_description,listings.focus_keyword,listings.og_title,listings.og_description,listings.og_image_url,listings.featured_slide_image_url,listings.view_count,listings.uen_verified_uen,listings.uen_verified_name,listings.uen_verified_status,listings.uen_verified_at,listings.quick_answer,listings.faqs,listings.offer_price,listings.offer_discount,listings.redemption_info,listings.published_date_locked,listings.published_at,listings.audience,listings.key_points".split(",");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const rows = await sql`
    select table_name || '.' || column_name as col from information_schema.columns
    where table_schema = 'public' and table_name in ('listings', 'hero_slides', 'listing_images')`;
  const have = new Set(rows.map((r) => r.col));
  const missing = EXPECTED.filter((c) => !have.has(c));
  console.log(missing.length ? `Missing in the database:\n  ${missing.join("\n  ")}` : "All expected columns are present.");
} catch (e) {
  console.error("Could not check:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
