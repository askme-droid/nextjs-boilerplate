import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { heroSlides } from "@/lib/db/schema";

export type HeroSlideRow = {
  id: string;
  imageUrl: string;
  altText: string;
  linkUrl: string | null;
  position: number;
  active: boolean;
};

const columns = {
  id: heroSlides.id,
  imageUrl: heroSlides.imageUrl,
  altText: heroSlides.altText,
  linkUrl: heroSlides.linkUrl,
  position: heroSlides.position,
  active: heroSlides.active,
};

/** Every slide, shown and hidden, in order — for /admin/hero. */
export function getAllHeroSlides(): Promise<HeroSlideRow[]> {
  return db.select(columns).from(heroSlides).orderBy(asc(heroSlides.position), asc(heroSlides.createdAt));
}

/** The slides the homepage shows, in order. */
export function getActiveHeroSlides(): Promise<HeroSlideRow[]> {
  return db
    .select(columns)
    .from(heroSlides)
    .where(eq(heroSlides.active, true))
    .orderBy(asc(heroSlides.position), asc(heroSlides.createdAt));
}
