CREATE TABLE "learner_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"day" text NOT NULL,
	"coins" integer NOT NULL,
	"item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learner_accounts" ADD COLUMN "tz_offset" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD COLUMN "words" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_ledger" ADD CONSTRAINT "learner_ledger_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_ledger_user_key" ON "learner_ledger" USING btree ("user_id","key");