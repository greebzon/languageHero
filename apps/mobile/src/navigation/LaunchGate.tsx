import { useState, type ReactNode } from 'react';
import type { AccountSnapshot } from '@lingvohero/contracts';
import { birthYearFor } from '@lingvohero/learning-core';
import { useAccount } from '../account/AccountProvider';
import { accountRequest } from '../account/api';
import { useDemo } from '../state/DemoProvider';
import { LanguagePicker } from '../components/LanguagePicker';
import { AgeQuestion } from '../components/AgePicker';

/* Accounts that already picked a language in this run of the app. Module state on purpose: it
   survives remounts of the signed-in tree and resets only with a cold start (a page reload on
   the web), which is exactly «при каждом запуске». */
const launchChosen = new Set<string>();
/* Accounts that answered the age question in this run, even if it did not reach the server. */
const ageAnswered = new Set<string>();

/**
 * Before the sets: a child without an age says it (once, older accounts too); a child without
 * a learning language picks one; a child learning several picks today's one at every start.
 */
export function LaunchGate({ children }: { children: ReactNode }) {
  const { account, update } = useAccount();
  const { languages } = useDemo();
  const [, rerender] = useState(0);
  const id = account!.profile.id;
  const done = () => {
    launchChosen.add(id);
    rerender((n) => n + 1);
  };
  if (account!.profile.birthYear === null && !ageAnswered.has(id))
    return (
      <AgeQuestion
        onPick={async (age) => {
          const birthYear = birthYearFor(age, new Date());
          try {
            update(await accountRequest<AccountSnapshot>('/me', { birthYear }, 'PATCH'));
          } catch {
            // Offline the game goes on with the answer; the question returns at a later start
            // until the server has it.
            update({ ...account!, profile: { ...account!.profile, birthYear } });
          }
          ageAnswered.add(id);
          rerender((n) => n + 1);
        }}
      />
    );
  if (languages.length === 0) return <LanguagePicker mode="first" onPicked={done} />;
  // One language: nothing to ask, and adding a second one later must not stop the game.
  if (languages.length === 1) launchChosen.add(id);
  if (!launchChosen.has(id)) return <LanguagePicker mode="launch" onPicked={done} />;
  return children;
}
