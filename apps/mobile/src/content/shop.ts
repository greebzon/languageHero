/* The mascot and wardrobe catalog: published by the panel, served at /v1/shop, cached on the
   device and replaced by a bundled default until the server has published anything. */
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shopCatalogSchema,
  type MascotSlots,
  type ShopCatalog,
  type ShopMascot,
} from '@lingvohero/contracts';
import {
  DEFAULT_MASCOT_LEVELS,
  DEFAULT_WARDROBE,
  shopItemsFrom,
  type ShopItem,
} from '@lingvohero/learning-core';
import { apiUrl } from './client';

const CACHE_KEY = `lingvohero.shop.v1:${apiUrl}`;
const bundled: Record<string, number> = {
  'mascot:fox': require('../../assets/images/mascots/fox.png'),
  'mascot:bear': require('../../assets/images/mascots/bear.png'),
  'mascot:rabbit': require('../../assets/images/mascots/rabbit.png'),
  'mascot:owl': require('../../assets/images/mascots/owl.png'),
  'item:astronaut': require('../../assets/images/shop/astronaut.png'),
  'item:glasses': require('../../assets/images/shop/glasses.png'),
  'item:crown': require('../../assets/images/shop/crown.png'),
  'item:cape': require('../../assets/images/shop/cape.png'),
  'item:cap': require('../../assets/images/shop/cap.png'),
  'item:chest': require('../../assets/images/shop/chest.png'),
};
/* Until a mascot has a generated slot map, the bundled ones share a plausible layout. */
const defaultSlots: MascotSlots = {
  head: { x: 0.25, y: 0.02, w: 0.5, h: 0.28 },
  eyes: { x: 0.3, y: 0.22, w: 0.4, h: 0.1 },
  outfit: { x: 0.25, y: 0.42, w: 0.5, h: 0.3 },
  back: { x: 0.1, y: 0.32, w: 0.8, h: 0.45 },
  companion: { x: 0.74, y: 0.28, w: 0.24, h: 0.24 },
};
const mascot = (
  id: string,
  name: string,
  withName: string,
  trait: string,
  perk: string,
): ShopMascot => ({
  id,
  name,
  withName,
  trait,
  perk,
  unlockLevel: DEFAULT_MASCOT_LEVELS[id] ?? 1,
  portrait: `bundled:mascot:${id}`,
  body: '',
  slots: defaultSlots,
});
export const DEFAULT_CATALOG: ShopCatalog = {
  version: 1,
  revision: 0,
  mascots: [
    mascot(
      'fox',
      'Лисёнок Тим',
      'Тимом',
      'Любознательный следопыт',
      'Радуется каждому новому слову',
    ),
    mascot('owl', 'Совёнок Умка', 'Умкой', 'Мудрый книгочей', 'Любит слушать, как звучат слова'),
    mascot(
      'bear',
      'Медвежонок Балу',
      'Балу',
      'Отважный путешественник',
      'Не боится ошибок — и тебе не даст',
    ),
    mascot('rabbit', 'Зайка Луна', 'Луной', 'Весёлая непоседа', 'Заряжает заниматься каждый день'),
  ],
  items: DEFAULT_WARDROBE.map((w) => ({ ...w, icon: `bundled:item:${w.id}` })),
  layers: [],
};

let current: ShopCatalog = DEFAULT_CATALOG;
const listeners = new Set<(c: ShopCatalog) => void>();
let loading: Promise<ShopCatalog> | null = null;
function publish(next: ShopCatalog) {
  current = next;
  listeners.forEach((l) => l(next));
}
/* A server catalog without mascots means nothing was published yet: keep the bundled one. */
const usable = (c: ShopCatalog): ShopCatalog =>
  c.mascots.length
    ? {
        ...c,
        mascots: c.mascots.some((m) => m.id === 'fox')
          ? c.mascots
          : [DEFAULT_CATALOG.mascots[0]!, ...c.mascots],
        items: c.items.length ? c.items : DEFAULT_CATALOG.items,
      }
    : DEFAULT_CATALOG;

export async function loadShopCatalog(): Promise<ShopCatalog> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) publish(usable(shopCatalogSchema.parse(JSON.parse(cached))));
    } catch {
      /* A damaged cache is simply refetched. */
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(`${apiUrl}/v1/shop`, { signal: controller.signal }).finally(() =>
        clearTimeout(timer),
      );
      if (response.ok) {
        const fresh = shopCatalogSchema.parse(await response.json());
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
        publish(usable(fresh));
      }
    } catch {
      /* Offline: the cached or bundled catalog stays. */
    } finally {
      loading = null;
    }
    return current;
  })();
  return loading;
}
export function useShopCatalog(): ShopCatalog {
  const [catalog, setCatalog] = useState(current);
  useEffect(() => {
    listeners.add(setCatalog);
    setCatalog(current);
    void loadShopCatalog();
    return () => {
      listeners.delete(setCatalog);
    };
  }, []);
  return catalog;
}
export const shopCatalog = () => current;
export function mascotOf(id: string, catalog: ShopCatalog = current): ShopMascot {
  return (
    catalog.mascots.find((m) => m.id === id) ??
    DEFAULT_CATALOG.mascots.find((m) => m.id === id) ??
    catalog.mascots[0] ??
    DEFAULT_CATALOG.mascots[0]!
  );
}
export const shopItemsOf = (catalog: ShopCatalog): ShopItem[] => shopItemsFrom(catalog.items);
/** Resolves a catalog media path (or a bundled marker) to an Image source. */
export function shopImage(path: string): ImageSourcePropType {
  if (path.startsWith('bundled:'))
    return bundled[path.slice('bundled:'.length)] ?? bundled['item:chest']!;
  return { uri: `${apiUrl}${path}` };
}
export function itemIcon(itemId: string, catalog: ShopCatalog = current): ImageSourcePropType {
  const item = catalog.items.find((i) => i.id === itemId);
  return item ? shopImage(item.icon) : shopImage(`bundled:item:${itemId}`);
}
