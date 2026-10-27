import type { ExerciseType } from '@lingvohero/contracts';
import { buildWord } from './build-word';
import { choice } from './choice';
import { listenAndSelect } from './listen-and-select';
import { matchPairs } from './match-pairs';
import type { MobileMechanic } from './types';

/* How the app shows each mechanic (the data side is in contracts/src/mechanics). The app asks
   the server for lessons of every contracts mechanic, so each needs a view here. */
const MECHANICS: { [K in ExerciseType]: MobileMechanic<K> } = {
  'listen-and-select': listenAndSelect,
  'match-pairs': matchPairs,
  'build-word': buildWord,
  choice,
};
// One cast: TypeScript cannot correlate an exercise's `type` with the module it selects.
export const mechanicFor = (type: ExerciseType) =>
  MECHANICS[type] as unknown as MobileMechanic<ExerciseType>;
export type { MechanicProps } from './types';
