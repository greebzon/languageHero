import { useState } from 'react';
import { describeError } from '../../app/api';
import { Badge, Notice, formatBytes, formatDate } from '../../components/ui';
import { AssetThumb, UploadButton, assetLabel, useAssets } from './AssetPicker';

export function MediaPage() {
  const [kind, setKind] = useState<'image' | 'audio' | undefined>(undefined);
  const assets = useAssets(kind);
  return (
    <>
      <div className="page-head">
        <h1>Медиа</h1>
        <UploadButton label="Загрузить PNG или WAV" />
      </div>
      <p className="muted">
        Файлы проверяются по содержимому (только PNG и WAV, до 5/10 МБ) и хранятся по SHA-256:
        одинаковый файл никогда не загружается дважды. Черновые файлы попадают в публичное хранилище
        только с выпуском.
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        {(
          [
            [undefined, 'Все'],
            ['image', 'Картинки'],
            ['audio', 'Звуки'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            className={`btn sm ${kind === value ? '' : 'light'}`}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
        <span className="muted small">Всего: {assets.data?.total ?? '…'}</span>
      </div>
      {assets.error && <Notice tone="error">{describeError(assets.error)}</Notice>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Файл</th>
              <th>Параметры</th>
              <th>Источник</th>
              <th>Статус</th>
              <th>Загружен</th>
            </tr>
          </thead>
          <tbody>
            {(assets.data?.items ?? []).map((asset) => (
              <tr key={asset.id}>
                <td>
                  <AssetThumb asset={asset} />
                </td>
                <td>
                  {assetLabel(asset)}
                  <div className="muted small">
                    <code>{asset.sha256.slice(0, 12)}…</code>
                  </div>
                </td>
                <td className="small">
                  {asset.kind === 'image'
                    ? `${asset.width}×${asset.height} px`
                    : `${((asset.durationMs ?? 0) / 1000).toFixed(1)} с`}
                  <div className="muted">{formatBytes(asset.byteSize)}</div>
                </td>
                <td className="small">
                  {asset.provenance.source === 'import' ? 'импорт каталога' : 'загрузка'}
                  {asset.provenance.uploadedBy && (
                    <div className="muted">{asset.provenance.uploadedBy}</div>
                  )}
                </td>
                <td>
                  <Badge value={asset.status} />
                </td>
                <td className="muted small">{formatDate(asset.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
