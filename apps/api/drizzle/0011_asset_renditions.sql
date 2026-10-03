CREATE TABLE "asset_renditions" (
	"source_asset_id" uuid NOT NULL,
	"box" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_renditions" ADD CONSTRAINT "asset_renditions_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_renditions" ADD CONSTRAINT "asset_renditions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_renditions_source_box" ON "asset_renditions" USING btree ("source_asset_id","box");