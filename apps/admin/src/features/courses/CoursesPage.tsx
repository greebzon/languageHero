import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, describeError } from '../../app/api';
import type { Course } from '../../app/types';
import { Badge, Notice } from '../../components/ui';
import { useLanguages } from '../languages/LanguagesPage';

export function useCourses(language?: string) {
  return useQuery({
    queryKey: ['courses', language ?? 'all'],
    queryFn: () =>
      api<{ items: Course[]; total: number }>(
        `/courses?limit=100${language ? `&language=${language}` : ''}`,
      ),
  });
}

export function CoursesPage() {
  const [params, setParams] = useSearchParams();
  const language = params.get('language') ?? '';
  const languages = useLanguages();
  const courses = useCourses(language || undefined);
  const queryClient = useQueryClient();
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api(`/languages/${language}/course-order`, { method: 'PUT', body: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courses'] }),
  });
  const items = courses.data?.items ?? [];
  const move = (index: number, delta: number) => {
    const ids = items.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };
  return (
    <>
      <div className="page-head">
        <h1>Сеты</h1>
        <Link className="btn" to="/courses/new">
          + Новый сет
        </Link>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <label className="row">
          <span className="small">Язык</span>
          <select
            value={language}
            onChange={(e) => setParams(e.target.value ? { language: e.target.value } : {})}
          >
            <option value="">Все языки</option>
            {(languages.data ?? []).map((l) => (
              <option key={l.code} value={l.code}>
                {l.title} ({l.code})
              </option>
            ))}
          </select>
        </label>
        {language && (
          <span className="muted small">
            Порядок в списке — порядок открытия сетов в приложении: следующий открывается после
            прохождения предыдущего.
          </span>
        )}
      </div>
      {courses.error && <Notice tone="error">{describeError(courses.error)}</Notice>}
      {reorder.error && <Notice tone="error">{describeError(reorder.error)}</Notice>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {language && <th>Порядок</th>}
              <th>Сет</th>
              <th>Язык</th>
              <th>Статус</th>
              <th>Уроков</th>
              <th>Ревизия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((course, index) => (
              <tr key={course.id}>
                {language && (
                  <td>
                    <span className="row">
                      <button
                        className="btn light sm"
                        type="button"
                        aria-label="Выше"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="btn light sm"
                        type="button"
                        aria-label="Ниже"
                        disabled={index === items.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </td>
                )}
                <td>
                  <span className="row">
                    {course.cover && <img className="thumb" src={course.cover.url} alt="" />}
                    <span>
                      <Link to={`/courses/${course.id}`}>{course.title}</Link>
                      <div className="muted small">
                        <code>{course.id}</code>
                      </div>
                    </span>
                  </span>
                </td>
                <td>
                  <code>{course.languageCode}</code>
                </td>
                <td>
                  <Badge value={course.visibility} />
                </td>
                <td>{course.lessonCount}</td>
                <td className="muted small">
                  {course.publishedRevision ? `#${course.publishedRevision}` : '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Сетов пока нет.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
