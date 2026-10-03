ALTER TABLE "learner_accounts" ADD COLUMN "tz_changed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "learner_accounts_recovery" ON "learner_accounts" USING btree ("recovery_hash");--> statement-breakpoint
CREATE INDEX "learner_attempts_user" ON "learner_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learner_challenges_email_created" ON "learner_challenges" USING btree ("email","created_at");