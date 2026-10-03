import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import { useSession } from '../../app/session';
import { Field, Notice } from '../../components/ui';

/** «Сменить пароль»: the current password, then the new one twice. Other sessions sign out. */
export function PasswordPage() {
  const { user } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const change = useMutation({
    mutationFn: () =>
      api('/auth/password', { body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
    },
  });
  const errors = change.error instanceof ApiError ? change.error.fieldErrors : {};
  const mismatch = repeat.length > 0 && repeat !== next;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (next !== repeat) return;
    change.mutate();
  };
  return (
    <>
      <div className="page-head">
        <h1>Смена пароля</h1>
      </div>
      <form className="panel" style={{ maxWidth: 460 }} onSubmit={submit}>
        <p className="muted small">
          Аккаунт <strong>{user?.login}</strong>. После смены пароля все другие входы в панель
          завершатся, этот останется.
        </p>
        {change.isSuccess && <Notice tone="success">Пароль изменён.</Notice>}
        {change.error && !errors?.currentPassword && !errors?.newPassword && (
          <Notice tone="error">{describeError(change.error)}</Notice>
        )}
        <Field label="Текущий пароль" error={errors?.currentPassword}>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label="Новый пароль" hint="не короче 8 символов" error={errors?.newPassword}>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </Field>
        <Field label="Новый пароль ещё раз" error={mismatch ? ['Пароли не совпадают'] : undefined}>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </Field>
        <button
          className="btn"
          type="submit"
          disabled={change.isPending || !current || next.length < 8 || next !== repeat}
        >
          {change.isPending ? 'Сохраняем…' : 'Сменить пароль'}
        </button>
      </form>
    </>
  );
}
