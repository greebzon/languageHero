import { MECHANIC_TYPES, type ExerciseType } from '@lingvohero/contracts';
import { buildWord } from './build-word';
import { choice } from './choice';
import { listenAndSelect } from './listen-and-select';
import { matchPairs } from './match-pairs';
import type { AdminMechanic } from './types';

/* How the panel edits and previews each mechanic (the data side is in contracts/src/mechanics). */
const MECHANICS: { [K in ExerciseType]: AdminMechanic<K> } = {
  'listen-and-select': listenAndSelect,
  'match-pairs': matchPairs,
  'build-word': buildWord,
  choice,
};
// One cast: TypeScript cannot correlate an exercise's `type` with the module it selects.
export const mechanicFor = (type: ExerciseType) =>
  MECHANICS[type] as unknown as AdminMechanic<ExerciseType>;
/** Every mechanic with its name, in registry order (buttons, generation checkboxes). */
export const MECHANIC_LIST = MECHANIC_TYPES.map((type) => ({ type, label: MECHANICS[type].label }));
