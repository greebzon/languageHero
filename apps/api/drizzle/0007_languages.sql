ALTER TABLE "learner_accounts" ADD COLUMN "languages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_accounts" ADD COLUMN "ui_locale" text;--> statement-breakpoint
UPDATE "learner_accounts" SET "languages" = jsonb_build_array("language") WHERE "onboarded" = 1;
