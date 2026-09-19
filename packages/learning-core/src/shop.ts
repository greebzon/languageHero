/* «Магазин» (stage 1: coins only). The wardrobe comes from the published shop catalog (the app
   bundles a default copy); boosters and the chest are built in. Purchases are judged and stored
   by the server; the same rules run on the device for instant feedback. */
import type { MascotSlot, ShopRarity } from '@lingvohero/contracts';
import { dayKey, type Journal } from './journal';

export type Rarity = ShopRarity;
export type ShopCategory = 'clothes' | 'hats' | 'companions' | 'boosters' | 'chests';
export type ShopItem = {
  id: string;
  name: string;
  description: string;
  kind: 'wardrobe' | 'booster' | 'chest';
  category: ShopCategory;
  rarity: Rarity;
  price: number;
  /** Wearables only: where the item sits on the mascot. */
  slot?: MascotSlot;
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Обычный',
  magic: 'Магический',
  legendary: 'Легендарный',
};
export const SHOP_CATEGORIES: { id: ShopCategory | 'all'; title: string }[] = [
  { id: 'all', title: 'Все товары' },
  { id: 'clothes', title: 'Одежда и плащи' },
  { id: 'hats', title: 'Шляпы и очки' },
  { id: 'companions', title: 'Спутники' },
  { id: 'boosters', title: 'Бустеры уроков' },
  { id: 'chests', title: 'Сундуки удачи' },
];
export const categoryForSlot = (slot: MascotSlot): ShopCategory =>
  slot === 'head' || slot === 'eyes' ? 'hats' : slot === 'companion' ? 'companions' : 'clothes';
export type WardrobeEntry = {
  id: string;
  name: string;
  description: string;
  slot: MascotSlot;
  rarity: Rarity;
  price: number;
};
/** Built-in goods that exist regardless of the published wardrobe. */
export const BUILTIN_ITEMS: ShopItem[] = [
  {
    id: 'freeze',
    name: 'Заморозка стрика',
    description: 'Сохранит серию занятий, если пропустишь день',
    kind: 'booster',
    category: 'boosters',
    rarity: 'common',
    price: 200,
  },
  {
    id: 'chest',
    name: 'Сундук новичка',
    description: 'Случайная вещь из гардероба, которой у тебя ещё нет',
    kind: 'chest',
    category: 'chests',
    rarity: 'common',
    price: 100,
  },
];
/** The full shop from a wardrobe list: wearables in catalog order, then the built-ins. */
export function shopItemsFrom(wardrobe: WardrobeEntry[]): ShopItem[] {
  return [
    ...wardrobe.map((w) => ({
      ...w,
      kind: 'wardrobe' as const,
      category: categoryForSlot(w.slot),
    })),
    ...BUILTIN_ITEMS,
  ];
}
export const DEFAULT_WARDROBE: WardrobeEntry[] = [
  {
    id: 'astronaut',
    name: 'Космический капитан',
    description: 'Скафандр и сияющий шлем для твоего героя',
    slot: 'outfit',
    rarity: 'legendary',
    price: 900,
  },
  {
    id: 'cape',
    name: 'Плащ героя',
    description: 'Красный плащ со звёздной застёжкой',
    slot: 'back',
    rarity: 'magic',
    price: 500,
  },
  {
    id: 'crown',
    name: 'Корона слов',
    description: 'Королевский блеск для знатока слов',
    slot: 'head',
    rarity: 'legendary',
    price: 800,
  },
  {
    id: 'glasses',
    name: 'Очки профессора',
    description: 'Золотая оправа для самых любознательных',
    slot: 'eyes',
    rarity: 'magic',
    price: 250,
  },
  {
    id: 'cap',
    name: 'Кепка скаута',
    description: 'Зелёная кепка со значком следопыта',
    slot: 'head',
    rarity: 'common',
    price: 150,
  },
];
export const DEFAULT_SHOP_ITEMS: ShopItem[] = shopItemsFrom(DEFAULT_WARDROBE);

export function shopItem(id: string, items: ShopItem[] = DEFAULT_SHOP_ITEMS): ShopItem | undefined {
  return items.find((i) => i.id === id);
}
/* One wardrobe item is half price each day; the pick rotates with the calendar. */
export function dailyDeal(
  today: Date,
  items: ShopItem[] = DEFAULT_SHOP_ITEMS,
): { item: ShopItem; price: number } | null {
  const wardrobe = items.filter((i) => i.kind === 'wardrobe');
  if (!wardrobe.length) return null;
  const dayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000,
  );
  const item = wardrobe[dayNumber % wardrobe.length]!;
  return { item, price: Math.round(item.price / 2) };
}
export function priceFor(item: ShopItem, today: Date, items: ShopItem[] = DEFAULT_SHOP_ITEMS) {
  const deal = dailyDeal(today, items);
  return deal && deal.item.id === item.id ? deal.price : item.price;
}
export function coinBalance(journal: Journal, lessonCoins: number): number {
  return lessonCoins + journal.bonusCoins - journal.spentCoins;
}
export function ownsItem(journal: Journal, itemId: string): boolean {
  return journal.inventory.items.includes(itemId);
}
export type PurchaseOutcome = 'ok' | 'owned' | 'poor' | 'nothing';
export function buyItem(
  journal: Journal,
  itemId: string,
  today: Date,
  lessonCoins: number,
  options: { random?: () => number; items?: ShopItem[] } = {},
): { journal: Journal; outcome: PurchaseOutcome; granted?: ShopItem } {
  const items = options.items ?? DEFAULT_SHOP_ITEMS;
  const random = options.random ?? Math.random;
  const item = shopItem(itemId, items);
  if (!item) return { journal, outcome: 'nothing' };
  if (item.kind === 'wardrobe' && ownsItem(journal, item.id)) return { journal, outcome: 'owned' };
  let granted: ShopItem | undefined;
  if (item.kind === 'chest') {
    const candidates = items.filter((i) => i.kind === 'wardrobe' && !ownsItem(journal, i.id));
    if (candidates.length === 0) return { journal, outcome: 'nothing' };
    granted = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  }
  const price = priceFor(item, today, items);
  if (coinBalance(journal, lessonCoins) < price) return { journal, outcome: 'poor' };
  const inventory = { ...journal.inventory, items: [...journal.inventory.items] };
  if (item.kind === 'booster') inventory.freezes += 1;
  else inventory.items.push((granted ?? item).id);
  return {
    journal: { ...journal, spentCoins: journal.spentCoins + price, inventory },
    outcome: 'ok',
    granted,
  };
}
/* Spends one streak freeze on yesterday when it was skipped after an active day,
   so the streak survives. Called whenever the journal is looked at. */
export function protectStreak(journal: Journal, today: Date): Journal {
  if (journal.inventory.freezes <= 0) return journal;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const before = new Date(today);
  before.setDate(before.getDate() - 2);
  const gap = journal.days[dayKey(yesterday)];
  const active = journal.days[dayKey(before)];
  if (gap || !active || !(active.lessons > 0 || active.frozen)) return journal;
  return {
    ...journal,
    days: {
      ...journal.days,
      [dayKey(yesterday)]: { lessons: 0, perfect: 0, words: 0, evening: false, frozen: true },
    },
    inventory: { ...journal.inventory, freezes: journal.inventory.freezes - 1 },
  };
}
