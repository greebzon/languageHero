import type { Catalog, LearningState } from '@lingvohero/contracts';

/**
 * The sets of a language as the map shows them. `stars` is the child's star total (every
 * completion, repeats included: `Journal.stars`). A set with `unlockStars` opens once the total
 * reaches it; a release without thresholds keeps the old rule (the previous set is complete).
 * A started, complete or once-opened set stays open either way.
 */
export function courseCards(
  catalog: Catalog,
  state: LearningState,
  language: string,
  stars: number,
) {
  let previousComplete = true;
  return catalog.courses
    .filter((c) => c.language === language)
    .map((course) => {
      const completed = course.lessons.filter((l) => state.progress[l.id]).length;
      const complete =
        completed === course.lessons.length || !!state.completedCourseIds?.includes(course.id);
      const started =
        completed > 0 || course.lessons.some((l) => l.id === state.session?.lesson.id);
      const earned =
        course.unlockStars === undefined ? previousComplete : stars >= course.unlockStars;
      const unlocked =
        earned || started || !!state.unlockedCourseIds?.includes(course.id) || complete;
      previousComplete = previousComplete && complete;
      return {
        course,
        completed,
        complete,
        unlocked,
        stars: course.lessons.reduce((sum, l) => sum + (state.progress[l.id]?.bestStars ?? 0), 0),
        /** Stars still missing to open the set (0 when open or without a threshold). */
        starsNeeded: unlocked ? 0 : Math.max(0, (course.unlockStars ?? 0) - stars),
        next: course.lessons.find((l) => !state.progress[l.id]) ?? course.lessons[0],
      };
    });
}

// Once earned, access and set completion survive catalog reordering and new lessons.
export function reconcileCourseAccess(
  catalog: Catalog,
  state: LearningState,
  stars: number,
): LearningState {
  const unlocked = new Set(state.unlockedCourseIds ?? []);
  const completed = new Set(state.completedCourseIds ?? []);
  for (const language of catalog.languages) {
    for (const card of courseCards(catalog, state, language.code, stars)) {
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
