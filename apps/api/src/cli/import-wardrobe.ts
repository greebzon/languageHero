/* Seeds the four bundled mascots and six shop items into the panel so they can be managed
   there. Portraits and item icons already exist as clean PNGs; the full-body pictures come
   from ../mascots and still need the «Сгенерировать всё» pass (background removal, slot map,
   outfit layers) — pass --generate to queue those jobs right away.
   Usage: pnpm admin:import-wardrobe [--generate] */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { storeAsset } from '../admin/asset-store.js';
import { itemTasks, mascotTasks } from '../admin/routes/wardrobe.js';
import { createDb } from '../db/client.js';
import { mascots, shopItems } from '../db/schema.js';
import { env, storageRoot } from '../env.js';
import { generationSettings } from '../generation/factory.js';
import { createAssetJob } from '../worker/queue.js';

// H:Myang_app: the repo (app/) and the design folders (mascots/) sit side by side there.
const root = resolve(import.meta.dirname, '../../../../..');
const MASCOTS = [
  {
    id: 'fox',
    name: 'Лисёнок Тим',
    withName: 'Тимом',
    trait: 'Любознательный следопыт',
    perk: 'Радуется каждому новому слову',
    description:
      'A cute orange fox cub with a white muzzle, big brown eyes, a small blue star-shaped scarf and orange sneakers',
    source:
      'mascots/full_body_standing_cartoon_fox_mascot_for_kids_educational_app_lingvohero_cute/screen.png',
  },
  {
    id: 'owl',
    name: 'Совёнок Умка',
    withName: 'Умкой',
    trait: 'Мудрый книгочей',
    perk: 'Любит слушать, как звучат слова',
    description:
      'A cute teal-and-cream owl with big amber eyes, tufted eyebrows, colorful blue-and-gold wings and a little book backpack',
    source:
      'mascots/full_body_standing_cute_cartoon_owl_mascot_for_kids_educational_app_lingvohero/screen.png',
  },
  {
    id: 'bear',
    name: 'Медвежонок Балу',
    withName: 'Балу',
    trait: 'Отважный путешественник',
    perk: 'Не боится ошибок — и тебе не даст',
    description: 'A cute brown bear cub with a round face, rosy cheeks and a blue t-shirt',
    source:
      'mascots/full_body_standing_cute_cartoon_baby_bear_mascot_for_kids_educational_app/screen.png',
  },
  {
    id: 'rabbit',
    name: 'Зайка Луна',
    withName: 'Луной',
    trait: 'Весёлая непоседа',
    perk: 'Заряжает заниматься каждый день',
    description:
      'A cute grey bunny with long ears, a dark raccoon-like eye mask, a striped tail, a blue bow tie and a small backpack',
    source:
      'mascots/full_body_standing_cute_cartoon_bunny_or_raccoon_mascot_with_long_ears_for_kids/screen.png',
  },
] as const;
const ITEMS = [
  {
    id: 'astronaut',
    name: 'Космический капитан',
    description: 'Скафандр и сияющий шлем для твоего героя',
    slot: 'outfit',
    rarity: 'legendary',
    price: 900,
    prompt: 'A playful orange astronaut spacesuit with a glowing round helmet and a small jetpack',
  },
  {
    id: 'cape',
    name: 'Плащ героя',
    description: 'Красный плащ со звёздной застёжкой',
    slot: 'back',
    rarity: 'magic',
    price: 500,
    prompt: 'A billowing red superhero cape with a yellow star clasp',
  },
  {
    id: 'crown',
    name: 'Корона слов',
    description: 'Королевский блеск для знатока слов',
    slot: 'head',
    rarity: 'legendary',
    price: 800,
    prompt: 'A radiant golden royal crown encrusted with green and red gems',
  },
  {
    id: 'glasses',
    name: 'Очки профессора',
    description: 'Золотая оправа для самых любознательных',
    slot: 'eyes',
    rarity: 'magic',
    price: 250,
    prompt: 'Chunky oversized round professor glasses with shiny golden frames',
  },
  {
    id: 'cap',
    name: 'Кепка скаута',
    description: 'Зелёная кепка со значком следопыта',
    slot: 'head',
    rarity: 'common',
    price: 150,
    prompt: 'A bright green scout baseball cap with an embroidered explorer badge',
  },
] as const;

async function main() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const generate = process.argv.includes('--generate');
  const handle = createDb(env.DATABASE_URL);
  const { db } = handle;
  try {
    const upload = async (path: string, name: string) =>
      (
        await storeAsset(db, storageRoot, await readFile(resolve(root, path)), {
          source: 'import',
          originalName: name,
        })
      ).asset;
    for (const [index, m] of MASCOTS.entries()) {
      if (await db.query.mascots.findFirst({ where: eq(mascots.id, m.id) })) {
        console.log(`mascot ${m.id}: already imported`);
        continue;
      }
      const source = await upload(m.source, `${m.id}-body-source.png`);
      const portrait = await upload(
        `app/apps/mobile/assets/images/mascots/${m.id}.png`,
        `${m.id}-portrait.png`,
      );
      await db.insert(mascots).values({
        unlockLevel: ({ fox: 1, rabbit: 3, bear: 5, owl: 8 } as Record<string, number>)[m.id] ?? 1,
        ...m,
        sourceAssetId: source.id,
        portraitAssetId: portrait.id,
        position: index,
      });
      console.log(`mascot ${m.id}: imported (portrait ready, body needs generation)`);
    }
    for (const [index, i] of ITEMS.entries()) {
      if (await db.query.shopItems.findFirst({ where: eq(shopItems.id, i.id) })) {
        console.log(`item ${i.id}: already imported`);
        continue;
      }
      const icon = await upload(
        `app/apps/mobile/assets/images/shop/${i.id}.png`,
        `${i.id}-icon.png`,
      );
      await db
        .insert(shopItems)
        .values({ ...i, sourceAssetId: icon.id, iconAssetId: icon.id, position: index });
      console.log(`item ${i.id}: imported (icon ready)`);
    }
    if (generate) {
      const settings = generationSettings(env);
      if (!settings.provider) throw new Error(settings.unavailableReason!);
      const items = await db.select().from(shopItems);
      for (const m of await db.select().from(mascots)) {
        const scope = m.bodyAssetId && m.slots ? 'layers' : 'all';
        const tasks = mascotTasks(m, items, scope).filter(
          (task) => task.stage !== 'mascot-portrait' || !m.portraitAssetId,
        );
        if (!tasks.length) continue;
        const { job } = await createAssetJob(db, {
          kind: 'mascot',
          subjectId: m.id,
          tasks,
          modelConfig: settings.modelConfig,
          idempotencyKey: randomUUID(),
          requestedBy: null,
          costLimitUsd: settings.costLimitUsd,
        });
        console.log(`mascot ${m.id}: job ${job.id} with ${tasks.length} task(s) queued`);
      }
      // Items already have icons; their layers are covered by the mascot jobs above.
      void itemTasks;
    } else
      console.log(
        'Run with --generate (or use the panel) to draw bodies, slot maps and outfit layers.',
      );
  } finally {
    await handle.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
