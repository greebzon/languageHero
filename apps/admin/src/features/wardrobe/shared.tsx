import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../app/api';
import type { Mascot, MascotSlot, ShopItem, ShopRarity, SlotBox } from '../../app/types';

export const SLOT_LABELS: Record<MascotSlot, string> = {
  head: 'Головной убор',
  eyes: 'Очки и маски',
  outfit: 'Одежда',
  back: 'Плащ и спина',
  companion: 'Спутник',
};
export const RARITY_LABELS: Record<ShopRarity, string> = {
  common: 'Обычный',
  magic: 'Магический',
  legendary: 'Легендарный',
};
export const SLOT_COLORS: Record<MascotSlot, string> = {
  head: '#22c55e',
  eyes: '#36b6fb',
  outfit: '#fea619',
  back: '#8061c0',
  companion: '#ea785c',
};
export type ListResponse<T> = {
  items: T[];
  providerReady: boolean;
  unavailableReason: string | null;
};
export const useMascots = () =>
  useQuery({ queryKey: ['mascots'], queryFn: () => api<ListResponse<Mascot>>('/mascots') });
export const useShopItems = () =>
  useQuery({ queryKey: ['shop-items'], queryFn: () => api<ListResponse<ShopItem>>('/shop-items') });

/**
 * Body picture with the slot boxes drawn over it, or with one outfit layer clipped to its box.
 * A clothes layer is a whole-character picture and is shown instead of the body (`replaces`).
 */
export function Stage({
  bodyUrl,
  slots,
  layer,
  width = 220,
  highlight,
}: {
  bodyUrl: string | null;
  slots?: Mascot['slots'];
  layer?: { url: string; box: SlotBox; replaces?: boolean } | null;
  width?: number;
  highlight?: MascotSlot;
}) {
  const height = Math.round(width * 1.5);
  if (!bodyUrl)
    return (
      <div className="stage empty" style={{ width, height }}>
        <span className="muted small">Тело ещё не создано</span>
      </div>
    );
  const inset = (b: SlotBox) =>
    `inset(${(b.y * 100).toFixed(2)}% ${((1 - b.x - b.w) * 100).toFixed(2)}% ${((1 - b.y - b.h) * 100).toFixed(2)}% ${(b.x * 100).toFixed(2)}%)`;
  return (
    <div className="stage" style={{ width, height }}>
      {layer?.replaces ? (
        <img src={layer.url} alt="" />
      ) : (
        <>
          <img src={bodyUrl} alt="" />
          {layer && <img src={layer.url} alt="" style={{ clipPath: inset(layer.box) }} />}
        </>
      )}
      {slots &&
        (Object.keys(slots) as MascotSlot[]).map((slot) => (
          <div
            key={slot}
            className="slot-box"
            title={SLOT_LABELS[slot]}
            style={{
              left: `${slots[slot].x * 100}%`,
              top: `${slots[slot].y * 100}%`,
              width: `${slots[slot].w * 100}%`,
              height: `${slots[slot].h * 100}%`,
              borderColor: SLOT_COLORS[slot],
              opacity: highlight && highlight !== slot ? 0.25 : 1,
            }}
          >
            <span style={{ background: SLOT_COLORS[slot] }}>{SLOT_LABELS[slot]}</span>
          </div>
        ))}
    </div>
  );
}

export function StatusBadges({ entity }: { entity: Mascot | ShopItem }) {
  return (
    <span className="row">
      {entity.activeJobId ? (
        <Link className="badge preview" to={`/generations/${entity.activeJobId}`}>
          Генерируется…
        </Link>
      ) : entity.ready ? (
        <span className="badge active">Готов</span>
      ) : (
        <span className="badge draft">Нет ассетов</span>
      )}
      <span className={`badge ${entity.published ? 'published' : 'draft'}`}>
        {entity.published ? 'Опубликован' : 'Не опубликован'}
      </span>
    </span>
  );
}
