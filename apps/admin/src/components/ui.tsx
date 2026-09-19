import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { FieldErrors } from '../app/api';

export function Field({
  label,
  hint,
  error,
  group,
  children,
}: {
  label: string;
  hint?: string;
  error?: string[];
  /* Several controls inside: a labelled group instead of a <label>, which would pass
     clicks on its caption to the first control. */
  group?: boolean;
  children: ReactNode;
}) {
  const content = (
    <>
      <span>
        {label} {hint && <span className="hint">— {hint}</span>}
      </span>
      {children}
      {error?.length ? <span className="error-text">{error.join('. ')}</span> : null}
    </>
  );
  return group ? (
    <div className="field" role="group" aria-label={label}>
      {content}
    </div>
  ) : (
    <label className="field">{content}</label>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'warn';
  children: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

const visibilityLabels: Record<string, string> = {
  draft: 'Черновик',
  preview: 'Анонс «Скоро»',
  published: 'Опубликован',
  archived: 'Архив',
  active: 'Активен',
  prepared: 'Подготовлен',
  publishing: 'Публикуется',
  failed: 'Ошибка',
  queued: 'В очереди',
  running: 'Выполняется',
  'awaiting-review': 'Готово к проверке',
  cancelled: 'Отменено',
  restore: 'откат',
  succeeded: 'Готово',
};
export function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{visibilityLabels[value] ?? value}</span>;
}

export function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <div className="crumbs">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && ' / '}
          {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
        </span>
      ))}
    </div>
  );
}

/** Errors whose paths do not belong to a rendered field (e.g. cross-field schema rules). */
export function GeneralErrors({ errors, known = [] }: { errors: FieldErrors; known?: string[] }) {
  const rest = Object.entries(errors).filter(([key]) => !known.includes(key));
  if (!rest.length) return null;
  return (
    <Notice tone="error">
      <ul>
        {rest.map(([key, messages]) => (
          <li key={key}>
            {key !== '_' && <code>{key}</code>} {messages.join('. ')}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

export const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;

// Titles are usually Russian and words may be in the target language, while ids must be latin.
const translit: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
  א: '',
  ב: 'b',
  ג: 'g',
  ד: 'd',
  ה: 'h',
  ו: 'v',
  ז: 'z',
  ח: 'kh',
  ט: 't',
  י: 'y',
  כ: 'k',
  ך: 'k',
  ל: 'l',
  מ: 'm',
  ם: 'm',
  נ: 'n',
  ן: 'n',
  ס: 's',
  ע: '',
  פ: 'p',
  ף: 'f',
  צ: 'ts',
  ץ: 'ts',
  ק: 'k',
  ר: 'r',
  ש: 'sh',
  ת: 't',
};

/** Stable ids for content entities: lowercase latin, digits and dashes (Cyrillic/Hebrew transliterated). */
export const slugify = (text: string) =>
  // Transliterate before decomposing, otherwise «й» would lose its breve and become «i».
  Array.from(text.toLowerCase().normalize('NFC'))
    .map((char) => translit[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // latin accents, Hebrew vowel points
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Four random lowercase letters/digits: makes ids from the same title unique. */
export const randomSuffix = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
    'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(b % 36),
  ).join('');

/** `<prefix>-<slug of title>[-<suffix>]`; a title without letters falls back to `fallback`. */
export const prefixedId = (prefix: string, title: string, fallback: string, suffix = '') =>
  [prefix, slugify(title).slice(0, 40).replace(/-+$/, '') || fallback, suffix]
    .filter(Boolean)
    .join('-');
