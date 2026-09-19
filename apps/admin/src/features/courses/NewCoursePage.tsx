import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/api';
import type { Course } from '../../app/types';
import { Crumbs } from '../../components/ui';
import { CourseForm, type CourseFormValue } from './CourseForm';

export function NewCoursePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (value: CourseFormValue) =>
      api<{ course: Course }>('/courses', {
        body: {
          ...value,
          topic: value.topic || null,
          description: value.description || null,
          texts: value.texts,
        },
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      navigate(`/courses/${r.course.id}`);
    },
  });
  return (
    <>
      <Crumbs items={[{ to: '/courses', label: 'Сеты' }, { label: 'Новый сет' }]} />
      <h1>Новый сет</h1>
      <CourseForm
        course={null}
        onSubmit={(value) => create.mutate(value)}
        error={create.error}
        busy={create.isPending}
      />
    </>
  );
}
