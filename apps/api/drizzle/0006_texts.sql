ALTER TABLE "courses" ADD COLUMN "texts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "languages" ADD COLUMN "titles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "texts" jsonb DEFAULT '{}'::jsonb NOT NULL;