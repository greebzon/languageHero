import type { Catalog, LearningState } from '@lingvohero/contracts';

export function courseCards(catalog: Catalog, state: LearningState, language: string) {
  let previousComplete = true;
  return catalog.courses
    .filter((c) => c.language === language)
    .map((course) => {
      const completed = course.lessons.filter((l) => state.progress[l.id]).length;
      const complete =
        completed === course.lessons.length || !!state.completedCourseIds?.includes(course.id);
      const started =
        completed > 0 || course.lessons.some((l) => l.id === state.session?.lesson.id);
      const unlocked =
        previousComplete || started || !!state.unlockedCourseIds?.includes(course.id) || complete;
      previousComplete = previousComplete && complete;
      return {
        course,
        completed,
        complete,
        unlocked,
        stars: course.lessons.reduce((sum, l) => sum + (state.progress[l.id]?.bestStars ?? 0), 0),
        next: course.lessons.find((l) => !state.progress[l.id]) ?? course.lessons[0],
      };
    });
}

// Once earned, access and set completion survive catalog reordering and new lessons.
export function reconcileCourseAccess(catalog: Catalog, state: LearningState): LearningState {
  const unlocked = new Set(state.unlockedCourseIds ?? []);
  const completed = new Set(state.completedCourseIds ?? []);
  for (const language of catalog.languages) {
    for (const card of courseCards(catalog, state, language.code)) {
      if (card.unlocked) unlocked.add(card.course.id);
      if (card.complete) completed.add(card.course.id);
    }
  }
  if (
    unlocked.size === (state.unlockedCourseIds?.length ?? 0) &&
    completed.size === (state.completedCourseIds?.length ?? 0)
  )
    return state;
  return { ...state, unlockedCourseIds: [...unlocked], completedCourseIds: [...completed] };
}

/**
 * The unfinished lesson the child can resume, or null. A session keeps a full snapshot of the
 * version it started on; once the catalog publishes a newer version (fixed pictures or sound),
 * resuming would keep showing the old material, so the stale session is not offered and the
 * next start begins the new version. A lesson the catalog does not list is left alone.
 */
export function resumableSession(state: LearningState, catalog: Catalog) {
  const session = state.session;
  if (!session || session.finished) return null;
  const ref = catalog.courses.flatMap((c) => c.lessons).find((l) => l.id === session.lesson.id);
  return ref && ref.version > session.lesson.version ? null : session;
}
