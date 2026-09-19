CREATE TABLE "mascots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"with_name" text NOT NULL,
	"trait" text NOT NULL,
	"perk" text NOT NULL,
	"description" text NOT NULL,
	"source_asset_id" uuid,
	"body_asset_id" uuid,
	"portrait_asset_id" uuid,
	"slots" jsonb,
	"published" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outfit_layers" (
	"mascot_id" text NOT NULL,
	"item_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"box" jsonb NOT NULL,
	"task_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"slot" text NOT NULL,
	"rarity" text NOT NULL,
	"price" integer NOT NULL,
	"prompt" text NOT NULL,
	"source_asset_id" uuid,
	"icon_asset_id" uuid,
	"published" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ALTER COLUMN "course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "kind" text DEFAULT 'course' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "mascots" ADD CONSTRAINT "mascots_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mascots" ADD CONSTRAINT "mascots_body_asset_id_assets_id_fk" FOREIGN KEY ("body_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mascots" ADD CONSTRAINT "mascots_portrait_asset_id_assets_id_fk" FOREIGN KEY ("portrait_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_layers" ADD CONSTRAINT "outfit_layers_mascot_id_mascots_id_fk" FOREIGN KEY ("mascot_id") REFERENCES "public"."mascots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_layers" ADD CONSTRAINT "outfit_layers_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit_layers" ADD CONSTRAINT "outfit_layers_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outfit_layers_pair" ON "outfit_layers" USING btree ("mascot_id","item_id");