import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, describeError } from '../../app/api';
import type { Asset } from '../../app/types';
import { Notice, formatBytes } from '../../components/ui';

export function useAssets(kind?: 'image' | 'audio') {
  return useQuery({
    queryKey: ['assets', kind ?? 'all'],
    queryFn: () =>
      api<{ items: Asset[]; total: number }>(`/assets?limit=100${kind ? `&kind=${kind}` : ''}`),
  });
}

/** One asset by id, for a selected file older than the newest 100 the library lists. */
function useAsset(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['asset', id],
    queryFn: () => api<{ asset: Asset }>(`/assets/${id}`).then((r) => r.asset),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api<{ asset: Asset; created: boolean }>('/assets', { form });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });
}

/** A narrower copy of a library picture: originals are up to 3 MB, the server shrinks them. */
export function previewUrl(url: string, width: 320 | 640) {
  return `${url}?w=${width}`;
}

export function AssetThumb({ asset, size = 44 }: { asset: Asset; size?: number }) {
  if (asset.kind === 'image')
    return (
      <img
        className="thumb"
        style={{ width: size, height: size }}
        src={previewUrl(asset.url, 320)}
        alt={asset.altText ?? asset.provenance.originalName ?? ''}
      />
    );
  return <audio controls preload="none" src={asset.url} style={{ width: 160 }} />;
}

export function assetLabel(asset: Asset) {
  return asset.provenance.originalName ?? `${asset.kind} ${asset.sha256.slice(0, 8)}`;
}

/** Upload button with the server's verdict; PNG/WAV are checked by content on the server. */
export function UploadButton({
  kind,
  onUploaded,
  label = 'Загрузить файл',
}: {
  kind?: 'image' | 'audio';
  onUploaded?: (asset: Asset) => void;
  label?: string;
}) {
  const upload = useUpload();
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="row">
      <input
        ref={input}
        type="file"
        accept={kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/wav' : '.png,.wav'}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            upload.mutate(file, {
              onSuccess: (r) => onUploaded?.(r.asset),
              onSettled: () => {
                if (input.current) input.current.value = '';
              },
            });
        }}
      />
      <button
        className="btn light sm"
        type="button"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? 'Загружаем…' : label}
      </button>
      {upload.error && <span className="error-text">{describeError(upload.error)}</span>}
      {upload.data && !upload.data.created && (
        <span className="muted small">Такой файл уже был в библиотеке — используем его.</span>
      )}
    </span>
  );
}

/**
 * Inline library: pick an existing file of the given kind or upload a new one. The library
 * lists the newest files only, so the caller passes the selected asset (`selected`) when it
 * has it — otherwise an older file would show as «не найден» with no way to remove it.
 */
export function AssetPicker({
  kind,
  value,
  selected,
  onChange,
}: {
  kind: 'image' | 'audio';
  value: string | null;
  selected?: Asset | null;
  onChange: (asset: Asset | null) => void;
}) {
  const assets = useAssets(kind);
  const [open, setOpen] = useState(false);
  const listed =
    assets.data?.items.find((a) => a.id === value) ??
    (selected && selected.id === value ? selected : null);
  const single = useAsset(value, Boolean(assets.data) && !listed);
  const current = listed ?? (single.data?.id === value ? single.data : null);
  return (
    <div className="stack">
      <div className="row">
        {current ? (
          <>
            <AssetThumb asset={current} />
            <span className="small">{assetLabel(current)}</span>
          </>
        ) : (
          <span className="muted small">{value ? 'Файл не найден' : 'Файл не выбран'}</span>
        )}
        <button className="btn light sm" type="button" onClick={() => setOpen(!open)}>
          {open ? 'Скрыть библиотеку' : 'Выбрать из библиотеки'}
        </button>
        <UploadButton kind={kind} onUploaded={(asset) => onChange(asset)} />
        {value && (
          <button className="link danger" type="button" onClick={() => onChange(null)}>
            Убрать
          </button>
        )}
      </div>
      {open && (
        <div className="panel" style={{ marginBottom: 0 }}>
          {assets.error && <Notice tone="error">{describeError(assets.error)}</Notice>}
          <div className="media-grid">
            {(assets.data?.items ?? []).map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={`media-tile ${asset.id === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(asset);
                  setOpen(false);
                }}
              >
                {asset.kind === 'image' ? (
                  <img src={previewUrl(asset.url, 320)} alt="" loading="lazy" />
                ) : (
                  <audio
                    controls
                    preload="none"
                    src={asset.url}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <span className="small">{assetLabel(asset)}</span>
                <span className="muted small">
                  {asset.kind === 'image'
                    ? `${asset.width}×${asset.height}`
                    : `${((asset.durationMs ?? 0) / 1000).toFixed(1)} с`}{' '}
                  · {formatBytes(asset.byteSize)}
                </span>
              </button>
            ))}
            {assets.data?.items.length === 0 && (
              <p className="muted">Библиотека пуста — загрузите первый файл.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
