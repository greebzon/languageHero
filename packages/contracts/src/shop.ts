import { z } from 'zod';
import { overlayLocaleSchema } from './course';

/* Mascots («спутники») and the wardrobe shop are data published by the admin panel; the app
   bundles a fallback copy for the first launch. Layers are per (mascot, item) images generated
   on that mascot's body, so an item really fits, and are drawn full-size over the body; `box`
   (normalized 0..1 of the body image) is the zone the item was painted in - clothes come as a
   whole-character picture and go under the other layers. */
export const mascotSlotSchema = z.enum(['head', 'eyes', 'outfit', 'back', 'companion']);
export type MascotSlot = z.infer<typeof mascotSlotSchema>;
export const SLOT_LABELS: Record<MascotSlot, string> = {
  head: 'Головной убор',
  eyes: 'Очки и маски',
  outfit: 'Одежда',
  back: 'Плащ и спина',
  companion: 'Спутник',
};
export const shopRaritySchema = z.enum(['common', 'magic', 'legendary']);
export type ShopRarity = z.infer<typeof shopRaritySchema>;
export const RARITY_LABELS: Record<ShopRarity, string> = {
  common: 'Обычный',
  magic: 'Магический',
  legendary: 'Легендарный',
};
export const slugIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const slotBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type SlotBox = z.infer<typeof slotBoxSchema>;
export const mascotSlotsSchema = z.object({
  head: slotBoxSchema,
  eyes: slotBoxSchema,
  outfit: slotBoxSchema,
  back: slotBoxSchema,
  companion: slotBoxSchema,
});
export type MascotSlots = z.infer<typeof mascotSlotsSchema>;

/* Names and descriptions in the other interface locales (the Russian ones are the base
   fields). Drafts may be half filled in the panel; the public catalog carries complete ones.
   `sourceHash` fingerprints the Russian a translation was made from («перевод устарел»). */
export const mascotTextsSchema = z.object({
  name: z.string().trim().max(40),
  withName: z.string().trim().max(40),
  trait: z.string().trim().max(60),
  perk: z.string().trim().max(80),
  sourceHash: z.string().max(64).optional(),
});
export const itemTextsSchema = z.object({
  name: z.string().trim().max(40),
  description: z.string().trim().max(120),
  sourceHash: z.string().max(64).optional(),
});
export const mascotTextsMapSchema = z.partialRecord(overlayLocaleSchema, mascotTextsSchema);
export const itemTextsMapSchema = z.partialRecord(overlayLocaleSchema, itemTextsSchema);
export type MascotTexts = z.infer<typeof mascotTextsMapSchema>;
export type ItemTexts = z.infer<typeof itemTextsMapSchema>;
/** «Перевести тексты» in «Маскоты» / «Магазин»: every mascot and item missing a translation. */
export const wardrobeTextsGenerateSchema = z.object({
  locales: z.array(overlayLocaleSchema).min(1).default(['en', 'he']),
  force: z.boolean().default(false),
  idempotencyKey: z.uuid(),
});

/* Admin inputs. */
export const mascotInputSchema = z.object({
  unlockLevel: z.number().int().min(1).max(1000).default(1),
  id: slugIdSchema,
  name: z.string().trim().min(1).max(40),
  /* Instrumental case for «вместе с …». */
  withName: z.string().trim().min(1).max(40),
  trait: z.string().trim().min(1).max(60),
  perk: z.string().trim().min(1).max(80),
  /* What the character looks like; the generator's brief when there is no reference image. */
  description: z.string().trim().min(1).max(600),
  sourceAssetId: z.uuid().nullable().default(null),
  texts: mascotTextsMapSchema.default({}),
});
export const mascotPatchSchema = z.object({
  unlockLevel: z.number().int().min(1).max(1000).optional(),
  texts: mascotTextsMapSchema.optional(),
  name: mascotInputSchema.shape.name.optional(),
  withName: mascotInputSchema.shape.withName.optional(),
  trait: mascotInputSchema.shape.trait.optional(),
  perk: mascotInputSchema.shape.perk.optional(),
  description: mascotInputSchema.shape.description.optional(),
  sourceAssetId: z.uuid().nullable().optional(),
  published: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
});
export const shopItemInputSchema = z.object({
  id: slugIdSchema,
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(120),
  slot: mascotSlotSchema,
  rarity: shopRaritySchema,
  price: z.number().int().min(1).max(100000),
  /* Visual brief for the generator (English or Russian). */
  prompt: z.string().trim().min(1).max(600),
  sourceAssetId: z.uuid().nullable().default(null),
  texts: itemTextsMapSchema.default({}),
});
export const shopItemPatchSchema = z.object({
  texts: itemTextsMapSchema.optional(),
  name: shopItemInputSchema.shape.name.optional(),
  description: shopItemInputSchema.shape.description.optional(),
  slot: mascotSlotSchema.optional(),
  rarity: shopRaritySchema.optional(),
  price: shopItemInputSchema.shape.price.optional(),
  prompt: shopItemInputSchema.shape.prompt.optional(),
  sourceAssetId: z.uuid().nullable().optional(),
  published: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
});
export const assetGenerateSchema = z.object({
  /* all = everything from scratch; layers = only the outfit layers; one target narrows to one pair. */
  scope: z.enum(['all', 'layers']).default('all'),
  targetId: slugIdSchema.optional(),
  idempotencyKey: z.uuid(),
});

/* Public catalog served to the app. Media paths are relative to the API origin and always
   point at the shop media route (a tampered catalog cannot send the app to another host). */
const shopMediaPath = z.string().regex(/^\/v1\/shop-media\/[a-f0-9]{64}\.png$/);
export const shopMascotSchema = z.object({
  unlockLevel: z.number().int().min(1).default(1),
  id: slugIdSchema,
  name: z.string(),
  withName: z.string(),
  trait: z.string(),
  perk: z.string(),
  portrait: shopMediaPath,
  body: shopMediaPath,
  slots: mascotSlotsSchema,
  /* Complete translations only; older apps ignore the field. */
  texts: z
    .partialRecord(
      overlayLocaleSchema,
      z.object({ name: z.string(), withName: z.string(), trait: z.string(), perk: z.string() }),
    )
    .optional(),
});
export const shopCatalogItemSchema = z.object({
  id: slugIdSchema,
  name: z.string(),
  description: z.string(),
  slot: mascotSlotSchema,
  rarity: shopRaritySchema,
  price: z.number().int().positive(),
  icon: shopMediaPath,
  texts: z
    .partialRecord(overlayLocaleSchema, z.object({ name: z.string(), description: z.string() }))
    .optional(),
});
export const outfitLayerSchema = z.object({
  mascotId: slugIdSchema,
  itemId: slugIdSchema,
  path: shopMediaPath,
  box: slotBoxSchema,
});
export const shopCatalogSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  mascots: z.array(shopMascotSchema),
  items: z.array(shopCatalogItemSchema),
  layers: z.array(outfitLayerSchema),
});
/* What a learner's mascot wears: one item id per slot. Stored in the account. */
export const outfitSchema = z.partialRecord(mascotSlotSchema, slugIdSchema);
export type Outfit = z.infer<typeof outfitSchema>;
export const outfitInputSchema = z.object({ outfit: outfitSchema });
export type ShopMascot = z.infer<typeof shopMascotSchema>;
export type ShopCatalogItem = z.infer<typeof shopCatalogItemSchema>;
export type OutfitLayer = z.infer<typeof outfitLayerSchema>;
export type ShopCatalog = z.infer<typeof shopCatalogSchema>;
