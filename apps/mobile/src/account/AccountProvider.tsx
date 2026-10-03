import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  journalSchema,
  learningStateSchema,
  profileSnapshotSchema,
  type AccountSnapshot,
} from '@lingvohero/contracts';
import { emptyJournal } from '@lingvohero/learning-core';
import { apiUrl } from '../content/client';
import { accountRequest, loadCredential, saveCredential, AccountError } from './api';
import { AccountWelcome } from './AccountWelcome';
import { Context } from './context';

export { useAccount } from './context';

const KEY = `lingvohero.account:${apiUrl}`;
const LOGGED_OUT = `${KEY}:logged-out`;
/* The device cache keeps what the game needs offline, not the child's email (it comes from
   the server with every /me). */
const forDisk = (snapshot: AccountSnapshot) => ({
  ...snapshot,
  profile: { ...snapshot.profile, email: '' },
});
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [login, setLogin] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  const update = (data: AccountSnapshot) => {
    // Only a well-formed profile replaces the one on screen and in the cache.
    if (!profileSnapshotSchema.safeParse(data.profile).success) return;
    const clean = { profile: data.profile, learning: data.learning, journal: data.journal };
    setAccount(clean);
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(KEY, JSON.stringify(forDisk(clean))))
      .catch(() => {});
  };
  useEffect(() => {
    void (async () => {
      try {
        if (await AsyncStorage.getItem(LOGGED_OUT)) return;
        const credential = await loadCredential();
        const raw = await AsyncStorage.getItem(KEY);
        if (raw && (Platform.OS === 'web' || credential)) {
          try {
            const saved = JSON.parse(raw) as AccountSnapshot;
            const profile = profileSnapshotSchema.safeParse(saved.profile);
            if (profile.success && learningStateSchema.safeParse(saved.learning).success)
              setAccount({
                ...saved,
                // Caches from older versions lack the language list and the interface language.
                profile: {
                  ...saved.profile,
                  languages: profile.data.languages,
                  locale: profile.data.locale,
                },
                journal: journalSchema.safeParse(saved.journal).success
                  ? saved.journal
                  : emptyJournal(),
              });
          } catch {
            /* A damaged cache must lead to login, never bypass it. */
          }
        }
        try {
          update(await accountRequest<AccountSnapshot>('/me'));
        } catch (e) {
          if (e instanceof AccountError && e.status === 401) setExpired(true);
        }
      } catch {
        setExpired(true);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const accept = async (data: AccountSnapshot & { token?: string; recoveryCode?: string }) => {
    if (Platform.OS !== 'web') await saveCredential(data.token ?? null);
    const clean = { profile: data.profile, learning: data.learning, journal: data.journal };
    await writes.current;
    await AsyncStorage.removeItem(LOGGED_OUT);
    await AsyncStorage.setItem(KEY, JSON.stringify(forDisk(clean)));
    setAccount(clean);
    setExpired(false);
    setLogin(false);
    setRecovery(data.recoveryCode ?? null);
  };
  const forget = async () => {
    await AsyncStorage.setItem(LOGGED_OUT, '1');
    await saveCredential(null);
    await writes.current;
    await AsyncStorage.removeItem(KEY);
    setAccount(null);
    setLogin(false);
    setRecovery(null);
  };
  if (!ready)
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  return (
    <Context.Provider
      value={{
        account,
        expired,
        setExpired,
        loginScreen: () => setLogin(true),
        accept,
        update,
        forget,
      }}
    >
      {!account || !account.profile.onboarded || login || recovery ? (
        <AccountWelcome
          recovery={recovery}
          dismissRecovery={() => setRecovery(null)}
          cancelLogin={account?.profile.onboarded ? () => setLogin(false) : undefined}
        />
      ) : (
        children
      )}
    </Context.Provider>
  );
}
