-- Homepage header slider table (migration 0018), safe to run more than once.
CREATE TABLE IF NOT EXISTS "hero_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_url" text NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"link_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "hero_slides" ("image_url", "alt_text", "position")
SELECT * FROM (VALUES
('/hero/overly-cheezy-pizza.jpg', 'Overly Cheezy Pizza — 1-for-1 regular pizzas at $25.90 and large pizzas at $33.90, plus 10% off your first online order', 1),
('/hero/mindspace-open-house.jpg', 'MindSpace after-school academy open house — enjoy over $2,460 in savings', 2),
('/hero/singgate-fr059-door-lock.jpg', 'Singgate FR059 digital door lock — 3D face and palm vein recognition, free installation, 2-year warranty', 3),
('/hero/lingoace-free-trial.jpg', 'LingoAce — free trial of online Chinese lessons for learners aged 3 to 15', 4),
('/hero/san-laundry-capsules.jpg', 'SAN 3-in-1 laundry detergent capsules — detergent, softener and anti-bacterial, on sale', 5),
('/hero/uems-healthcare-attendant.jpg', 'UEMS is hiring healthcare attendants in Seng Kang — salary up to $2,100', 6),
('/hero/kumon-registration.jpg', 'Kumon — 100% off registration fee (save $50) when you sign up by 15 September 2024', 7)
) AS v(image_url, alt_text, position)
-- Only the first time: never re-adds slides once the table has any.
WHERE NOT EXISTS (SELECT 1 FROM "hero_slides");
