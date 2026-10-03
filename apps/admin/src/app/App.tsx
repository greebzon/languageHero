import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router';
import { RequireAuth, SessionProvider, useSession } from './session';
import { LoginPage } from '../features/auth/LoginPage';
import { LanguagesPage } from '../features/languages/LanguagesPage';
import { CoursesPage } from '../features/courses/CoursesPage';
import { CoursePage } from '../features/courses/CoursePage';
import { NewCoursePage } from '../features/courses/NewCoursePage';
import { LessonPage } from '../features/lessons/LessonPage';
import { PreviewPage } from '../features/preview/PreviewPage';
import { MediaPage } from '../features/media/MediaPage';
import { PublicationsPage } from '../features/publications/PublicationsPage';
import { WizardPage } from '../features/generation/WizardPage';
import { JobPage } from '../features/generation/JobPage';
import { MascotsPage } from '../features/wardrobe/MascotsPage';
import { MascotPage } from '../features/wardrobe/MascotPage';
import { ShopItemsPage } from '../features/wardrobe/ShopItemsPage';
import { ShopItemPage } from '../features/wardrobe/ShopItemPage';
import { PasswordPage } from '../features/account/PasswordPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter basename="/admin">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Shell />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="/courses" replace />} />
              <Route path="/languages" element={<LanguagesPage />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/courses/new" element={<NewCoursePage />} />
              <Route path="/courses/:id" element={<CoursePage />} />
              <Route path="/courses/:id/generate" element={<WizardPage />} />
              <Route path="/generations/:id" element={<JobPage />} />
              <Route path="/lessons/:id" element={<LessonPage />} />
              <Route path="/lessons/:id/preview" element={<PreviewPage />} />
              <Route path="/media" element={<MediaPage />} />
              <Route path="/publications" element={<PublicationsPage />} />
              <Route path="/mascots" element={<MascotsPage />} />
              <Route path="/mascots/:id" element={<MascotPage />} />
              <Route path="/shop" element={<ShopItemsPage />} />
              <Route path="/shop/:id" element={<ShopItemPage />} />
              <Route path="/password" element={<PasswordPage />} />
              <Route path="*" element={<p>Страница не найдена</p>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const { user, logout } = useSession();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Разделы">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🦊
          </span>
          <span>ЛингвоГерой</span>
        </div>
        <NavLink to="/courses">Сеты</NavLink>
        <NavLink to="/languages">Языки</NavLink>
        <NavLink to="/media">Медиа</NavLink>
        <NavLink to="/publications">Выпуски</NavLink>
        <NavLink to="/mascots">Маскоты</NavLink>
        <NavLink to="/shop">Магазин</NavLink>
        <div className="sidebar-footer">
          <span className="muted">{user?.login}</span>
          <NavLink to="/password" className="link" title="Сменить пароль">
            Пароль
          </NavLink>
          <button type="button" className="link" onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
