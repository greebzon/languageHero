/* What the mascot wears: one item per slot. Ownership is judged elsewhere (the journal's
   inventory); these rules only keep an outfit consistent with a catalog. */
import type { MascotSlot, Outfit, OutfitLayer } from '@lingvohero/contracts';

/** Draw order of the layers over the body (bottom first). */
/* Clothes come as a whole-character picture (body included), so they go under everything,
   a cape included: its clasp and edges are drawn over the suit. */
export const SLOT_Z: Record<MascotSlot, number> = {
  outfit: 5,
  back: 10,
  eyes: 60,
  head: 80,
  companion: 100,
};
export const SLOT_ORDER: MascotSlot[] = (Object.keys(SLOT_Z) as MascotSlot[]).sort(
  (a, b) => SLOT_Z[a] - SLOT_Z[b],
);
type Wearable = { id: string; slot: MascotSlot };

export function equip(outfit: Outfit, item: Wearable): Outfit {
  return { ...outfit, [item.slot]: item.id };
}
export function unequip(outfit: Outfit, slot: MascotSlot): Outfit {
  const { [slot]: _removed, ...rest } = outfit;
  return rest;
}
export const isEquipped = (outfit: Outfit, itemId: string) =>
  Object.values(outfit).includes(itemId);
export const wornCount = (outfit: Outfit) => Object.values(outfit).filter(Boolean).length;
/** Drops entries the catalog no longer has, that sit in the wrong slot, or that are not owned. */
export function cleanOutfit(outfit: Outfit, items: Wearable[], owned: string[]): Outfit {
  const next: Outfit = {};
  for (const [slot, id] of Object.entries(outfit) as [MascotSlot, string | undefined][]) {
    if (!id) continue;
    const item = items.find((i) => i.id === id);
    if (item && item.slot === slot && owned.includes(id)) next[slot] = id;
  }
  return next;
}
/** The layers to draw for a mascot, bottom to top; a preview replaces its slot. */
export function outfitLayers(
  outfit: Outfit,
  layers: OutfitLayer[],
  mascotId: string,
  preview?: Wearable | null,
): { slot: MascotSlot; itemId: string; layer: OutfitLayer }[] {
  const worn: Outfit = preview ? equip(outfit, preview) : outfit;
  const result: { slot: MascotSlot; itemId: string; layer: OutfitLayer }[] = [];
  for (const slot of SLOT_ORDER) {
    const itemId = worn[slot];
    if (!itemId) continue;
    const layer = layers.find((l) => l.mascotId === mascotId && l.itemId === itemId);
    if (layer) result.push({ slot, itemId, layer });
  }
  return result;
}
