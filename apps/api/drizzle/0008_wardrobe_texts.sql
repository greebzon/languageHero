ALTER TABLE "mascots" ADD COLUMN "texts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_items" ADD COLUMN "texts" jsonb DEFAULT '{}'::jsonb NOT NULL;