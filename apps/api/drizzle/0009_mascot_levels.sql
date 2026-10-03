CREATE TABLE "learner_mascots" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"mascot_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learner_accounts" ADD COLUMN "level_floor" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "mascots" ADD COLUMN "unlock_level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_mascots" ADD CONSTRAINT "learner_mascots_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Existing accounts retain their selected friend and their previous level (computed on first read).
UPDATE learner_accounts SET level_floor = NULL;
--> statement-breakpoint
INSERT INTO learner_mascots (key, user_id, mascot_id)
SELECT id::text || ':' || avatar, id, avatar FROM learner_accounts ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE mascots SET unlock_level = CASE id WHEN 'rabbit' THEN 3 WHEN 'bear' THEN 5 WHEN 'owl' THEN 8 ELSE 1 END;
