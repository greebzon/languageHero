import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useAccount } from '../account/context';
import { accountRequest, AccountError, serverText } from '../account/api';
import type { AccountSnapshot, Attempt, Outfit } from '@lingvohero/contracts';
import { useNetworkState } from 'expo-network';
import {
  learn,
  learningRewards,
  courseCards,
  reconcileCourseAccess,
  migrateDemo,
  newLearningState,
  restoreLearningState,
  coinBalance,
  emptyJournal,
  recordLesson,
  restoreJournal,
  resumableSession,
  starsFor,
  type Journal,
  type LearningAction,
  type PurchaseOutcome,
  type ShopItem,
} from '@lingvohero/learning-core';
import {
  catalogSchema,
  courseLessonSchema,
  visibleCatalog,
  type Catalog,
  type CourseLesson,
  type LearningState,
} from '@lingvohero/contracts';
import {
  apiUrl,
  fetchCatalog,
  fetchLesson,
  packageKey,
  prepareLesson,
  seed,
} from '../content/client';
import { loadShopCatalog } from '../content/shop';
import { colors } from '../theme';
import { Label, ToyButton } from '../components/ui';
import { restartForDirection, translate, useLocale, useT, type TextKey } from '../i18n';

const CACHE_KEY = `lingvohero.content.v2:${apiUrl}`;
/** Where the results stand; screens show `app.sync.<status>`. */
export type SyncStatus =
  | 'checking'
  | 'saving'
  | 'confirmEmail'
  | 'needsReplay'
  | 'sendingRest'
  | 'saved'
  | 'waiting'
  | 'offline';
type ContextValue = {
  state: LearningState;
  dispatch: (action: LearningAction) => void;
  storageError: boolean;
  /** The sets this child sees: translated to the interface language, titles in it. */
  catalog: Catalog;
  /** Everything published, whatever the interface language (languages, unfinished sessions). */
  fullCatalog: Catalog;
  refresh: () => Promise<void>;
  refreshing: boolean;
  catalogStatus: 'saved' | 'live' | 'unavailable';
  startLesson: (id: string) => Promise<boolean>;
  loadingLesson: boolean;
  /** The last lesson could not be loaded (screens show `app.errors.lesson`). */
  lessonError: boolean;
  library: CourseLesson[];
  /** The language being learned right now ('' until the first pick). */
  language: string;
  /** Every language the child learns, in the order they were added. */
  languages: string[];
  /** Makes a language current (adding it when new); false when the server did not get it yet. */
  chooseLanguage: (code: string) => Promise<boolean>;
  syncStatus: SyncStatus;
  /** Why the server turned a result down (its own words), if it did. */
  syncProblem: string | null;
  pendingCount: number;
  syncNow: () => Promise<boolean>;
  legacyAvailable: boolean;
  importLegacy: () => Promise<void>;
  leaveAccount: (remove?: boolean) => Promise<void>;
  /* «Сокровищница»: the server's journal (quests, trophies, purchases), extended optimistically
     for lessons that are not synced yet. Claims and purchases are server calls. */
  journal: Journal;
  coins: number;
  wordsTotal: number;
  claimQuest: (questId: string) => Promise<void>;
  buy: (itemId: string) => Promise<{ outcome: PurchaseOutcome; granted?: ShopItem }>;
  /* What the mascot wears; saved in the account, so every device shows the same look. */
  outfit: Outfit;
  saveOutfit: (outfit: Outfit) => Promise<void>;
};
/* Minutes east of UTC, so the server's «сегодня» follows the child's clock. */
const tzOffset = () => -new Date().getTimezoneOffset();
const Context = createContext<ContextValue | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const auth = useAccount();
  const userId = auth.account!.profile.id;
  const STORAGE_KEY = `lingvohero.learning.v3:${apiUrl}:${userId}`;
  type Record = {
    state: LearningState;
    pending: Attempt[];
    sequence: number;
    deviceId: string;
    rejected: { id: string; message: string }[];
    journal: Journal;
    /** Languages picked offline that the server has not stored yet. */
    addedLanguages?: string[];
  };
  const [record, setRecord] = useState<Record>(() => {
    const remote = auth.account!.learning;
    return {
      state: {
        ...remote,
        session: remote.session ? { ...remote.session, attemptId: randomUUID() } : null,
      },
      pending: [],
      sequence: 0,
      deviceId: randomUUID(),
      rejected: [],
      journal: auth.account!.journal ?? emptyJournal(),
    };
  });
  const state = record.state;
  const recordRef = useRef(record);
  recordRef.current = record;
  const setState = useCallback(
    (value: LearningState | ((s: LearningState) => LearningState)) =>
      setRecord((current) => {
        const next = typeof value === 'function' ? value(current.state) : value;
        if (next === current.state) return current;
        let pending = current.pending;
        let journal = current.journal;
        const s = next.session;
        if (s?.finished && !current.state.session?.finished) {
          if (s.attemptId && s.events)
            pending = [
              ...pending,
              {
                id: s.attemptId,
                lessonId: s.lesson.id,
                version: s.lesson.version,
                events: s.events,
              },
            ];
          journal = recordLesson(journal, {
            firstTime: !current.state.progress[s.lesson.id],
            words: s.lesson.words.length,
            perfect: s.mistakes === 0,
            stars: starsFor(s.mistakes),
            at: new Date(),
          });
        }
        return { ...current, state: next, pending, journal, sequence: current.sequence + 1 };
      }),
    [],
  );
  const { locale, chosen, setLocale } = useLocale();
  const { t } = useT();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const fail = (key: TextKey) => new Error(translate(localeRef.current, key));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking');
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const inflight = useRef<Promise<boolean> | null>(null);
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);
  const [catalog, setCatalog] = useState(seed.catalog);
  const visible = useMemo(() => visibleCatalog(catalog, locale), [catalog, locale]);
  const profile = auth.account!.profile;
  const languages = useMemo(
    () => [...new Set([...(profile.languages ?? []), ...(record.addedLanguages ?? [])])],
    [profile.languages, record.addedLanguages],
  );
  const [language, setLanguage] = useState(() =>
    profile.languages?.includes(profile.language)
      ? profile.language
      : (profile.languages?.[0] ?? ''),
  );
  /* A new device follows the interface language chosen on another one, until a choice here. */
  useEffect(() => {
    if (chosen || !profile.locale || profile.locale === locale) return;
    void setLocale(profile.locale).then((restart) => restart && restartForDirection());
    // Once per sign-in: later choices on this device win.
  }, []);
  /* A choice made on this device while signed in is saved in the account (not on every start,
     so two devices with different choices do not overwrite each other). */
  const shownLocale = useRef(locale);
  useEffect(() => {
    if (shownLocale.current === locale) return;
    shownLocale.current = locale;
    if (!chosen || auth.account!.profile.locale === locale) return;
    void accountRequest<AccountSnapshot>('/me', { locale }, 'PATCH')
      .then((snap) => !stopped.current && auth.update(snap))
      .catch(() => {});
  }, [chosen, locale]);
  const packages = useRef(new Map(seed.lessons.map((l) => [packageKey(l), l])));
  const [library, setLibrary] = useState(seed.lessons);
  const [ready, setReady] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetsError, setAssetsError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshBusy = useRef(false);
  const startBusy = useRef(false);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [lessonError, setLessonError] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<ContextValue['catalogStatus']>('saved');
  const writes = useRef(Promise.resolve());
  const cacheWrites = useRef(Promise.resolve());
  const network = useNetworkState();
  const saveCache = useCallback((next: Catalog) => {
    const snapshot = JSON.stringify({ catalog: next, packages: [...packages.current.values()] });
    cacheWrites.current = cacheWrites.current
      .then(() => AsyncStorage.setItem(CACHE_KEY, snapshot))
      .catch(() => setStorageError(true));
  }, []);
  const refresh = useCallback(async () => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    setRefreshing(true);
    try {
      const next = await fetchCatalog();
      setCatalog(next);
      saveCache(next);
      setCatalogStatus('live');
      // Mascots and shop items are published separately; refresh them alongside the catalog.
      void loadShopCatalog();
    } catch {
      setCatalogStatus('unavailable');
    } finally {
      refreshBusy.current = false;
      setRefreshing(false);
    }
  }, [saveCache]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [raw, owner, cache] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem('lingvohero.legacy.owner'),
          AsyncStorage.getItem(CACHE_KEY),
        ]);
        if (!active) return;
        if (raw) {
          const saved = JSON.parse(raw) as Record;
          const restored = restoreLearningState(saved.state);
          if (restored && Array.isArray(saved.pending) && typeof saved.deviceId === 'string')
            setRecord({ ...saved, state: restored, journal: restoreJournal(saved.journal) });
          else setStorageError(true);
        }
        setLegacyAvailable(
          !auth.account!.profile.legacyImported &&
            (!owner || owner === userId) &&
            !!(
              (await AsyncStorage.getItem('lingvohero.learning.v2')) ||
              (await AsyncStorage.getItem('lingvohero.demo.v1'))
            ),
        );
        if (cache) {
          try {
            const stored = JSON.parse(cache);
            const savedCatalog = catalogSchema.parse(stored.catalog);
            const savedPackages = courseLessonSchema.array().parse(stored.packages);
            savedPackages.forEach((l) => packages.current.set(packageKey(l), l));
            setLibrary([...packages.current.values()]);
            setCatalog(savedCatalog);
          } catch {
            /* A corrupt content cache must not discard learning progress. */
          }
        }
      } catch {
        if (active) setStorageError(true);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setAssetsError(false);
    void prepareLesson(state.session?.lesson ?? seed.lessons[0])
      .then(() => {
        if (active) setAssetsReady(true);
      })
      .catch(() => {
        if (active) setAssetsError(true);
      });
    return () => {
      active = false;
    };
    // Startup and explicit retry only; startLesson prepares later packages.
  }, [ready, attempt]);
  useEffect(() => {
    if (!ready || stopped.current) return;
    const serialized = JSON.stringify(record);
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, serialized))
      .catch(() => setStorageError(true));
  }, [ready, record]);
  /* One sync at a time; callers that need the server up to date await the one in flight. */
  function syncNow(): Promise<boolean> {
    if (inflight.current) return inflight.current;
    if (!ready || stopped.current) return Promise.resolve(false);
    inflight.current = runSync().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }
  async function runSync(): Promise<boolean> {
    if (auth.expired) {
      setSyncStatus('confirmEmail');
      return false;
    }
    setSyncStatus('saving');
    const sent = recordRef.current;
    try {
      await writes.current;
      const result = await accountRequest<
        AccountSnapshot & {
          accepted: string[];
          rejected: { id: string; code?: string; message: string }[];
        }
      >('/sync', {
        deviceId: sent.deviceId,
        sequence: sent.sequence,
        attempts: sent.pending.slice(0, 30),
        session: sent.state.session,
        soundEnabled: sent.state.soundEnabled,
        tzOffset: tzOffset(),
        locale: localeRef.current,
      });
      if (stopped.current) return false;
      auth.update(result);
      const added = (sent.addedLanguages ?? []).filter(
        (c) => !result.profile.languages.includes(c),
      );
      if (added.length)
        void accountRequest<AccountSnapshot>(
          '/me',
          { languages: [...result.profile.languages, ...added] },
          'PATCH',
        )
          .then((snap) => {
            if (stopped.current) return;
            auth.update(snap);
            setRecord((current) => ({
              ...current,
              addedLanguages: current.addedLanguages?.filter(
                (c) => !snap.profile.languages.includes(c),
              ),
            }));
          })
          .catch(() => {});
      setRecord((current) => {
        const processed = new Set([...result.accepted, ...result.rejected.map((r) => r.id)]);
        const pending = current.pending.filter((a) => !processed.has(a.id));
        const progress = { ...result.learning.progress };
        for (const a of pending)
          if (current.state.progress[a.lessonId])
            progress[a.lessonId] = current.state.progress[a.lessonId];
        return {
          ...current,
          pending,
          journal: result.journal,
          rejected: [
            ...current.rejected,
            ...result.rejected.map((r) => ({ id: r.id, message: serverText(r) ?? r.message })),
          ],
          state: {
            ...current.state,
            progress,
            unlockedCourseIds: [
              ...new Set([
                ...(current.state.unlockedCourseIds ?? []),
                ...(result.learning.unlockedCourseIds ?? []),
              ]),
            ],
            completedCourseIds: [
              ...new Set([
                ...(current.state.completedCourseIds ?? []),
                ...(result.learning.completedCourseIds ?? []),
              ]),
            ],
          },
        };
      });
      setSyncStatus(
        result.rejected.length || sent.rejected.length
          ? 'needsReplay'
          : sent.pending.length > 30
            ? 'sendingRest'
            : 'saved',
      );
      return (
        result.rejected.length === 0 &&
        recordRef.current.sequence === sent.sequence &&
        sent.pending.length <= 30
      );
    } catch (e) {
      if (stopped.current) return false;
      if (e instanceof AccountError && e.status === 401) auth.setExpired(true);
      setSyncStatus(e instanceof AccountError && e.status === 401 ? 'waiting' : 'offline');
      return false;
    }
  }
  /* Quests and purchases are judged by the server, so unsynced lessons must reach it first. */
  async function settled() {
    if (!recordRef.current.pending.length) return;
    if (!(await syncNow())) throw fail('app.errors.settleFirst');
  }
  async function leaveAccount(remove = false) {
    stopped.current = true;
    await writes.current;
    if (remove) await AsyncStorage.removeItem(STORAGE_KEY);
  }
  async function importLegacy() {
    const owner = await AsyncStorage.getItem('lingvohero.legacy.owner');
    if (owner && owner !== userId) throw fail('app.errors.legacyOwned');
    const raw = await AsyncStorage.getItem('lingvohero.learning.v2');
    const old = await AsyncStorage.getItem('lingvohero.demo.v1');
    const legacy = raw
      ? restoreLearningState(JSON.parse(raw))
      : old
        ? migrateDemo(JSON.parse(old), seed.lessons[0])
        : null;
    if (!legacy) throw fail('app.errors.legacyUnreadable');
    await AsyncStorage.setItem('lingvohero.legacy.owner', userId);
    const result = await accountRequest<AccountSnapshot>('/legacy/import', legacy.progress);
    auth.update(result);
    setRecord((current) => ({ ...current, journal: result.journal }));
    setState((current) => ({
      ...current,
      progress: { ...current.progress, ...result.learning.progress },
    }));
    setLegacyAvailable(false);
  }
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void syncNow(), 1500);
    return () => clearTimeout(timer);
  }, [ready, record.sequence, network.isConnected, auth.expired, locale]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (ready) void syncNow();
    }, 30000);
    return () => clearInterval(timer);
  }, [ready, auth.expired]);
  useEffect(() => {
    if (ready) setState((current) => reconcileCourseAccess(visible, current, record.journal.stars));
  }, [ready, visible, state, record.journal.stars]);
  const wordsTotal = new Set(
    library
      .filter((l) => state.progress[l.id])
      .flatMap((l) => l.words.map((w) => `${l.language}:${w.id}`)),
  ).size;
  const [outfit, setOutfit] = useState<Outfit>(auth.account!.profile.outfit ?? {});
  useEffect(() => {
    setOutfit(auth.account!.profile.outfit ?? {});
  }, [auth.account]);
  async function saveOutfit(next: Outfit) {
    await settled();
    const snap = await accountRequest<AccountSnapshot>('/outfit', { outfit: next }, 'PATCH');
    auth.update(snap);
    setOutfit(snap.profile.outfit ?? {});
  }
  async function chooseLanguage(code: string) {
    setLanguage(code);
    if (!languages.includes(code))
      setRecord((current) => ({
        ...current,
        addedLanguages: [...new Set([...(current.addedLanguages ?? []), code])],
      }));
    try {
      const snap = await accountRequest<AccountSnapshot>('/me', { language: code }, 'PATCH');
      if (stopped.current) return true;
      auth.update(snap);
      setRecord((current) => ({
        ...current,
        addedLanguages: current.addedLanguages?.filter((c) => !snap.profile.languages.includes(c)),
      }));
      return true;
    } catch {
      // Kept on the device; the next successful sync sends it.
      return false;
    }
  }
  async function claimQuest(questId: string) {
    await settled();
    const { journal } = await accountRequest<{ journal: Journal }>('/treasury/claim', {
      questId,
      tzOffset: tzOffset(),
    });
    setRecord((current) => ({ ...current, journal }));
  }
  async function buy(itemId: string) {
    await settled();
    const result = await accountRequest<{
      journal: Journal;
      outcome: PurchaseOutcome;
      granted: ShopItem | null;
    }>('/treasury/buy', { itemId, tzOffset: tzOffset() });
    setRecord((current) => ({ ...current, journal: result.journal }));
    return { outcome: result.outcome, granted: result.granted ?? undefined };
  }
  useEffect(() => {
    if (ready && network.isConnected !== false) void refresh();
  }, [ready, network.isConnected, refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (value) => {
      if (value === 'active' && ready) void refresh();
    });
    return () => sub.remove();
  }, [ready, refresh]);
  async function startLesson(id: string) {
    if (startBusy.current) return false;
    startBusy.current = true;
    setLoadingLesson(true);
    setLessonError(false);
    try {
      const resumable = resumableSession(state, catalog);
      if (resumable) {
        await prepareLesson(resumable.lesson);
        return true;
      }
      const course = visible.courses.find((c) => c.lessons.some((l) => l.id === id));
      const index = course?.lessons.findIndex((l) => l.id === id) ?? -1;
      if (
        !course ||
        index < 0 ||
        !courseCards(visible, state, course.language, record.journal.stars).find(
          (c) => c.course.id === course.id,
        )?.unlocked ||
        (!state.progress[id] && course.lessons.slice(0, index).some((l) => !state.progress[l.id]))
      )
        throw new Error('Locked lesson');
      const ref = course.lessons[index];
      let lesson = packages.current.get(packageKey(ref));
      if (!lesson) lesson = await fetchLesson(ref, course.language);
      await prepareLesson(lesson);
      packages.current.set(packageKey(lesson), lesson);
      setLibrary([...packages.current.values()]);
      saveCache(catalog);
      // A stale unfinished session (its lesson was republished) gives way to the new version.
      setState((current) =>
        learn(resumableSession(current, catalog) ? current : { ...current, session: null }, {
          type: 'start',
          lesson,
          attemptId: randomUUID(),
        }),
      );
      return true;
    } catch {
      setLessonError(true);
      return false;
    } finally {
      startBusy.current = false;
      setLoadingLesson(false);
    }
  }
  if (!ready || !assetsReady)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
          padding: 24,
          gap: 16,
        }}
      >
        {!assetsError && <ActivityIndicator color={colors.green} />}
        <Label style={{ textAlign: 'center' }}>
          {assetsError ? t('app.loading.failed') : t('app.loading.preparing')}
        </Label>
        {assetsError && (
          <ToyButton title={t('common.retry')} onPress={() => setAttempt((n) => n + 1)} />
        )}
      </View>
    );
  return (
    <Context.Provider
      value={{
        state,
        dispatch: (action) =>
          setState((current) =>
            learn(
              current,
              action.type === 'start' ? { ...action, attemptId: randomUUID() } : action,
            ),
          ),
        storageError,
        catalog: visible,
        fullCatalog: catalog,
        refresh,
        refreshing,
        catalogStatus,
        startLesson,
        loadingLesson,
        lessonError,
        library,
        language,
        languages,
        chooseLanguage,
        syncStatus,
        syncProblem: record.rejected[0]?.message ?? null,
        pendingCount: record.pending.length,
        syncNow,
        legacyAvailable,
        importLegacy,
        leaveAccount,
        journal: record.journal,
        coins: coinBalance(record.journal, learningRewards(state).coins),
        wordsTotal,
        claimQuest,
        buy,
        outfit,
        saveOutfit,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDemo() {
  const context = useContext(Context);
  if (!context) throw new Error('DemoProvider is missing');
  return context;
}
