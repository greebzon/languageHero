CREATE TABLE "learner_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT 'fox' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"onboarded" integer DEFAULT 0 NOT NULL,
	"recovery_hash" text,
	"legacy_imported" integer DEFAULT 0 NOT NULL,
	"learning" jsonb DEFAULT '{"version":2,"soundEnabled":true,"progress":{},"session":null}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "learner_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"stars" integer NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_devices" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_rewards" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"xp" integer NOT NULL,
	"coins" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "learner_attempts" ADD CONSTRAINT "learner_attempts_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_challenges" ADD CONSTRAINT "learner_challenges_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_devices" ADD CONSTRAINT "learner_devices_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_rewards" ADD CONSTRAINT "learner_rewards_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_sessions" ADD CONSTRAINT "learner_sessions_user_id_learner_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."learner_accounts"("id") ON DELETE cascade ON UPDATE no action;