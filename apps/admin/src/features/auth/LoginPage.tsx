import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { describeError } from '../../app/api';
import { useSession } from '../../app/session';
import { Field, Notice } from '../../components/ui';

export function LoginPage() {
  const { user, login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/courses';
  if (user) return <Navigate to={returnTo} replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(name, password);
      navigate(returnTo, { replace: true });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="content" style={{ maxWidth: 420, margin: '10vh auto' }}>
      <form className="panel" onSubmit={(e) => void submit(e)}>
        <h1>Панель ЛингвоГероя</h1>
        <p className="muted">Вход для редакторов контента.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Логин">
          <input
            type="text"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <button className="btn" type="submit" disabled={busy}>
          Войти
        </button>
      </form>
    </main>
  );
}
