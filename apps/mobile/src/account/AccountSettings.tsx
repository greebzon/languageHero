import { useState } from 'react';
import { Modal, TextInput, View, StyleSheet } from 'react-native';
import { LOCALES, type AccountSnapshot } from '@lingvohero/contracts';
import { useAccount } from './context';
import { accountRequest } from './api';
import { accountStyles } from './AccountWelcome';
import { useDemo } from '../state/DemoProvider';
import { Heading, Label, ToyButton } from '../components/ui';
import { router } from 'expo-router';
import { LOCALE_NAMES, restartForDirection, useLocale, useT } from '../i18n';
import { fonts } from '../theme';

type Device = { id: string; deviceName: string; current: boolean; createdAt: string };
type Action = 'email' | 'recovery' | 'delete' | 'revoke' | 'logout' | null;
export function AccountSettings() {
  const auth = useAccount();
  const profile = auth.account!.profile;
  const demo = useDemo();
  const { t, tn } = useT();
  const { locale, setLocale } = useLocale();
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newChallenge, setNewChallenge] = useState('');
  const [newCode, setNewCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  /* A new writing direction needs a restart: 'ask' offers it, 'manual' when the build can't. */
  const [restart, setRestart] = useState<'ask' | 'manual' | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.tryLater'));
    } finally {
      setBusy(false);
    }
  };
  const select = (value: Action, id?: string) => {
    setAction(value);
    setChallenge('');
    setCode('');
    setNewChallenge('');
    setNewCode('');
    setRecovery('');
    setSessionId(id);
    setError('');
    setNotice('');
  };
  async function confirm() {
    const proof = { challengeId: challenge, code };
    if (action === 'recovery') {
      const result = await accountRequest<{ recoveryCode: string }>('/recovery-code', proof);
      setRecovery(result.recoveryCode);
      setAction(null);
    }
    if (action === 'email') {
      const result = await accountRequest<AccountSnapshot & { token?: string }>('/email', {
        old: proof,
        next: { challengeId: newChallenge, code: newCode },
      });
      await auth.accept(result);
      setAction(null);
      setNotice(t('settings.emailChanged'));
    }
    if (action === 'delete') {
      await accountRequest('/delete', proof);
      await demo.leaveAccount(true);
      await auth.forget();
    }
    if (action === 'revoke') {
      await accountRequest('/sessions/revoke', { ...proof, sessionId });
      if (!sessionId || devices.find((d) => d.id === sessionId)?.current) {
        await demo.leaveAccount();
        await auth.forget();
      } else {
        setDevices(await accountRequest<Device[]>('/sessions'));
        setAction(null);
        setNotice(t('settings.deviceRevoked'));
      }
    }
  }
  const syncStatus = t(`app.sync.${demo.syncStatus}`);
  return (
    <View style={s.panel}>
      <Heading>{t('settings.title')}</Heading>
      <Label>{profile.email}</Label>
      <Label accessibilityLiveRegion="polite">
        {demo.syncProblem
          ? t('settings.syncProblem', { status: syncStatus, problem: demo.syncProblem })
          : syncStatus}
      </Label>
      {!!demo.pendingCount && <Label>{tn('settings.pending', demo.pendingCount)}</Label>}
      <ToyButton
        title={t(auth.expired ? 'settings.confirmEmail' : 'settings.saveOnServer')}
        tone="light"
        disabled={busy}
        onPress={() =>
          auth.expired
            ? auth.loginScreen()
            : void run(async () => {
                await demo.syncNow();
              })
        }
      />
      <Label>{t('settings.nameTitle')}</Label>
      <TextInput
        accessibilityLabel={t('settings.nameLabel')}
        value={name}
        onChangeText={setName}
        maxLength={30}
        style={accountStyles.input}
      />
      <Label>{t('settings.companion')}</Label>
      <ToyButton title={t('friends.title')} tone="light" onPress={() => router.push('/friends')} />
      <ToyButton
        title={t('settings.saveProfile')}
        disabled={busy || !name.trim()}
        onPress={() =>
          void run(async () => {
            auth.update(await accountRequest<AccountSnapshot>('/me', { name }, 'PATCH'));
            setNotice(t('settings.profileSaved'));
          })
        }
      />
      <View style={s.group}>
        <Label style={s.groupTitle}>{t('settings.locale.title')}</Label>
        <Label>{t('settings.locale.hint')}</Label>
        <View style={s.row}>
          {LOCALES.map((code) => (
            <ToyButton
              key={code}
              testID={`locale-${code}`}
              title={LOCALE_NAMES[code]}
              tone={locale === code ? 'green' : 'light'}
              onPress={() =>
                void setLocale(code).then((needsRestart) => {
                  if (needsRestart) setRestart('ask');
                })
              }
            />
          ))}
        </View>
      </View>
      {demo.legacyAvailable && (
        <View style={s.group}>
          <Label>{t('settings.legacy.text')}</Label>
          <ToyButton
            title={t('settings.legacy.button')}
            tone="light"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await demo.importLegacy();
                setNotice(t('settings.legacy.done'));
              })
            }
          />
        </View>
      )}
      <ToyButton
        title={t('settings.devices')}
        tone="light"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            setDevices(await accountRequest<Device[]>('/sessions'));
          })
        }
      />
      {devices.map((d) => (
        <View key={d.id} style={s.group}>
          <Label>
            {d.current ? t('settings.thisDevice', { name: d.deviceName }) : d.deviceName}
          </Label>
          <ToyButton
            title={t('settings.revokeDevice')}
            tone="light"
            onPress={() => select('revoke', d.id)}
          />
        </View>
      ))}
      <ToyButton title={t('settings.logoutAll')} tone="light" onPress={() => select('revoke')} />
      <ToyButton title={t('settings.changeEmail')} tone="light" onPress={() => select('email')} />
      <ToyButton
        title={t('settings.newRecovery')}
        tone="light"
        onPress={() => select('recovery')}
      />
      <ToyButton title={t('settings.logout')} tone="light" onPress={() => select('logout')} />
      <ToyButton title={t('settings.delete')} tone="light" onPress={() => select('delete')} />
      {action && (
        <View style={s.group}>
          <Heading style={{ fontSize: 20 }}>{t(`settings.actions.${action}`)}</Heading>
          {action === 'delete' && <Label>{t('settings.deleteWarning')}</Label>}
          {action === 'recovery' && <Label>{t('settings.recoveryWarning')}</Label>}
          {action === 'logout' ? (
            <>
              <Label>
                {t(demo.pendingCount ? 'settings.logoutPending' : 'settings.logoutSafe')}
              </Label>
              <ToyButton
                title={t('settings.confirmLogout')}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await demo.syncNow();
                    try {
                      await accountRequest('/auth/logout', {});
                    } catch {
                      /* Offline logout clears local credentials; pending data stays scoped to this user. */
                    }
                    await demo.leaveAccount();
                    await auth.forget();
                  })
                }
              />
            </>
          ) : (
            <>
              <Label>{t('settings.confirmBy', { email: profile.email })}</Label>
              <ToyButton
                title={t('settings.getCode')}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const result = await accountRequest<{ challengeId: string }>('/auth/code', {
                      purpose: 'reauth',
                    });
                    setChallenge(result.challengeId);
                    setNotice(t('settings.codeSent'));
                  })
                }
              />
              {!!challenge && (
                <TextInput
                  accessibilityLabel={t('settings.codeLabel')}
                  value={code}
                  onChangeText={setCode}
                  placeholder={t('settings.codePlaceholder')}
                  maxLength={5}
                  keyboardType="number-pad"
                  style={accountStyles.input}
                />
              )}
              {action === 'email' && (
                <>
                  <TextInput
                    accessibilityLabel={t('settings.newEmail')}
                    value={newEmail}
                    onChangeText={(v) => {
                      setNewEmail(v);
                      setNewChallenge('');
                    }}
                    placeholder={t('settings.newEmail')}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={accountStyles.input}
                  />
                  <ToyButton
                    title={t('settings.newEmailCode')}
                    disabled={busy || !newEmail}
                    onPress={() =>
                      void run(async () => {
                        const result = await accountRequest<{ challengeId: string }>('/auth/code', {
                          email: newEmail,
                          purpose: 'change-email',
                        });
                        setNewChallenge(result.challengeId);
                      })
                    }
                  />
                  {!!newChallenge && (
                    <TextInput
                      accessibilityLabel={t('settings.newEmailCode')}
                      value={newCode}
                      onChangeText={setNewCode}
                      maxLength={5}
                      keyboardType="number-pad"
                      style={accountStyles.input}
                    />
                  )}
                </>
              )}
              <ToyButton
                title={t('settings.confirmAction')}
                disabled={busy || code.length !== 5 || (action === 'email' && newCode.length !== 5)}
                onPress={() => void run(confirm)}
              />
            </>
          )}
          <ToyButton title={t('settings.cancel')} tone="light" onPress={() => select(null)} />
        </View>
      )}
      {!!recovery && (
        <View style={s.group}>
          <Label>{t('settings.recoverySave')}</Label>
          <Label selectable>{recovery}</Label>
          <ToyButton title={t('welcome.savedCode')} onPress={() => setRecovery('')} />
        </View>
      )}
      {!!error && (
        <Label accessibilityLiveRegion="polite" style={accountStyles.error}>
          {error}
        </Label>
      )}
      {!!notice && <Label accessibilityLiveRegion="polite">{notice}</Label>}
      <Modal
        transparent
        visible={!!restart}
        animationType="fade"
        onRequestClose={() => setRestart(null)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Heading>{t('app.restart.title')}</Heading>
            <Label>{t('app.restart.text')}</Label>
            {restart === 'ask' && (
              <ToyButton
                title={t('app.restart.now')}
                onPress={() => {
                  if (!restartForDirection()) setRestart('manual');
                }}
              />
            )}
            <ToyButton title={t('common.close')} tone="light" onPress={() => setRestart(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  panel: { gap: 14, marginTop: 24 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { padding: 16, borderRadius: 20, backgroundColor: '#EAF3FF', gap: 12 },
  groupTitle: { fontFamily: fonts.heading, fontSize: 16 },
  overlay: { flex: 1, backgroundColor: '#12342588', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 28,
    gap: 20,
  },
});
