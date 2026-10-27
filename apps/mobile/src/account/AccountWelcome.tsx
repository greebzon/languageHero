import { useEffect, useState, type ComponentProps } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { AccountProfile, AccountSnapshot } from '@lingvohero/contracts';
import { Heading, Icon, Label, ToyButton } from '../components/ui';
import { MascotFace, MascotPicker } from '../components/MascotPicker';
import { useT } from '../i18n';
import { colors, fonts } from '../theme';
import { accountRequest } from './api';
import { useAccount } from './context';

type Purpose = 'login' | 'recover';
type IconName = ComponentProps<typeof Ionicons>['name'];
/* Text field with a leading icon; the frame turns green while focused. */
function Field({ icon, ...props }: TextInputProps & { icon: IconName }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[s.field, focus && s.fieldFocus]}>
      <View style={s.fieldIcon}>
        <Icon name={icon} size={20} color={focus ? colors.greenInk : colors.muted} />
      </View>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={s.fieldInput}
      />
    </View>
  );
}
function LinkButton({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={18} color={colors.blueInk} />
      <Label style={s.linkText}>{title}</Label>
    </Pressable>
  );
}
export function AccountWelcome({
  recovery,
  dismissRecovery,
  cancelLogin,
}: {
  recovery: string | null;
  dismissRecovery: () => void;
  cancelLogin?: () => void;
}) {
  const { account, accept, update } = useAccount();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ id: string; purpose: Purpose } | null>(null);
  const [recover, setRecover] = useState(false);
  const [backup, setBackup] = useState('');
  const [name, setName] = useState(account?.profile.name ?? '');
  const [avatar, setAvatar] = useState<AccountProfile['avatar']>(account?.profile.avatar ?? 'fox');
  const [step, setStep] = useState<'name' | 'mascot'>('name');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const { t, tn } = useT();
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.min(60, Math.max(0, Math.ceil((sentAt + 60000 - clock) / 1000)));
  const purpose: Purpose = recover ? 'recover' : 'login';
  /* A code stays valid while the user looks at the other mode, so only hide it
     when it was issued for a different purpose or another email. */
  const active = challenge?.purpose === purpose ? challenge : null;
  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }
  const onboarding = account && !account.profile.onboarded && !cancelLogin;
  const choosing = onboarding && step === 'mascot';
  const tagline = t(
    recovery
      ? 'welcome.tagline.recovery'
      : onboarding
        ? 'welcome.tagline.onboarding'
        : recover
          ? 'welcome.tagline.recover'
          : 'welcome.tagline.login',
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Android runs edge-to-edge, so the window no longer shrinks for the keyboard:
          without this the code field at the bottom hides behind it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
          {!choosing && (
            <View style={s.brand}>
              <MascotFace id="fox" size={118} />
              <Label style={s.kicker}>{t('common.tagline')}</Label>
              <Heading style={s.appName}>{t('common.appName')}</Heading>
              <Heading style={s.tagline}>{tagline}</Heading>
            </View>
          )}
          {recovery ? (
            <View style={s.card}>
              <Label style={s.hint}>{t('welcome.recoveryHint')}</Label>
              <Label selectable style={s.secret}>
                {recovery}
              </Label>
              <ToyButton
                title={t('welcome.savedCode')}
                icon="checkmark"
                onPress={dismissRecovery}
              />
            </View>
          ) : onboarding ? (
            step === 'name' ? (
              <View style={s.card}>
                <Label style={s.cardTitle}>{t('welcome.nameTitle')}</Label>
                <Field
                  icon="happy-outline"
                  accessibilityLabel={t('welcome.nameLabel')}
                  placeholder={t('welcome.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                  maxLength={30}
                />
                <ToyButton
                  title={t('common.next')}
                  icon="arrow-forward"
                  disabled={!name.trim()}
                  onPress={() => setStep('mascot')}
                />
              </View>
            ) : (
              <>
                <MascotPicker
                  unlockedIds={
                    account?.profile.unlockedMascotIds ?? ['fox', account?.profile.avatar ?? 'fox']
                  }
                  selected={avatar}
                  onSelect={setAvatar}
                  confirm={{
                    disabled: busy,
                    onPress: () =>
                      void run(async () => {
                        update(
                          await accountRequest<AccountSnapshot>('/me', { name, avatar }, 'PATCH'),
                        );
                      }),
                  }}
                />
                <LinkButton
                  title={t('common.back')}
                  icon="arrow-back"
                  onPress={() => setStep('name')}
                />
              </>
            )
          ) : (
            <>
              <View style={s.card}>
                <Label style={s.cardTitle}>
                  {t(recover ? 'welcome.recoverTitle' : 'welcome.loginTitle')}
                </Label>
                <Label style={s.hint}>
                  {t(recover ? 'welcome.recoverHint' : 'welcome.loginHint')}
                </Label>
                <Field
                  icon="mail-outline"
                  accessibilityLabel={t('welcome.emailLabel')}
                  placeholder={t('welcome.emailPlaceholder')}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setChallenge(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
                {recover && (
                  <Field
                    icon="key-outline"
                    accessibilityLabel={t('welcome.backupCode')}
                    placeholder={t('welcome.backupCode')}
                    value={backup}
                    onChangeText={setBackup}
                    autoCapitalize="none"
                  />
                )}
                <ToyButton
                  title={
                    remaining
                      ? tn('welcome.resendIn', remaining)
                      : t(active ? 'welcome.resend' : 'welcome.getCode')
                  }
                  icon={remaining ? undefined : 'paper-plane-outline'}
                  disabled={busy || remaining > 0 || !email.trim()}
                  onPress={() =>
                    void run(async () => {
                      const result = await accountRequest<{ challengeId: string }>('/auth/code', {
                        email,
                        purpose,
                      });
                      setChallenge({ id: result.challengeId, purpose });
                      setCode('');
                      setSentAt(Date.now());
                    })
                  }
                />
              </View>
              {active && (
                <View style={s.card}>
                  <View style={s.sent}>
                    <Icon name="checkmark-circle" size={22} color={colors.green} />
                    <Label style={[s.hint, { flex: 1 }]}>
                      {t('welcome.sent', { email: email.trim() })}
                    </Label>
                  </View>
                  <TextInput
                    accessibilityLabel={t('welcome.codeLabel')}
                    placeholder="••••••"
                    placeholderTextColor="#B9C6D6"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    style={s.code}
                  />
                  <ToyButton
                    title={t('welcome.confirmEmail')}
                    icon="checkmark"
                    disabled={busy || code.length !== 6}
                    onPress={() =>
                      void run(async () => {
                        const data = await accountRequest<
                          AccountSnapshot & { token?: string; recoveryCode?: string }
                        >(recover ? '/auth/recover' : '/auth/verify', {
                          challengeId: active.id,
                          code,
                          deviceName: t(
                            Platform.OS === 'web'
                              ? 'welcome.device.web'
                              : Platform.OS === 'ios'
                                ? 'welcome.device.ios'
                                : 'welcome.device.android',
                          ),
                          ...(recover ? { recoveryCode: backup.trim() } : {}),
                        });
                        await accept(data);
                      })
                    }
                  />
                </View>
              )}
              <LinkButton
                title={t(recover ? 'welcome.backToLogin' : 'welcome.noAccess')}
                icon={recover ? 'arrow-back' : 'help-circle-outline'}
                onPress={() => {
                  setRecover(!recover);
                  setError('');
                }}
              />
              {cancelLogin && (
                <LinkButton
                  title={t('welcome.backToSaved')}
                  icon="book-outline"
                  onPress={cancelLogin}
                />
              )}
              <View style={s.footer}>
                <Icon name="lock-closed-outline" size={15} color={colors.muted} />
                <Label style={s.footerText}>{t('welcome.footer')}</Label>
              </View>
            </>
          )}
          {!!error && (
            <View accessibilityLiveRegion="polite" style={s.errorBox}>
              <Icon name="alert-circle" size={20} color="#A63022" />
              <Label style={s.error}>{error}</Label>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export const accountStyles = StyleSheet.create({
  input: {
    backgroundColor: '#EFF4FF',
    borderWidth: 2,
    borderColor: '#E6EEFF',
    borderRadius: 20,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.ink,
  },
  error: { color: '#A63022', fontSize: 14, lineHeight: 20, flex: 1 },
});
const s = StyleSheet.create({
  ...accountStyles,
  page: {
    padding: 20,
    gap: 14,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    paddingBottom: 60,
  },
  brand: { alignItems: 'center', gap: 2, paddingTop: 8, marginBottom: 4 },
  kicker: {
    marginTop: 10,
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
    color: colors.greenInk,
  },
  appName: { fontFamily: fonts.heavy, fontSize: 36, lineHeight: 42, letterSpacing: -0.5 },
  tagline: { fontSize: 18, lineHeight: 24, color: '#3D4A3D', marginTop: 4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderBottomWidth: 6,
    borderBottomColor: '#D5E3FC',
    padding: 18,
    gap: 12,
  },
  cardTitle: { fontFamily: fonts.heavy, fontSize: 19, lineHeight: 24, color: colors.ink },
  hint: { fontSize: 15, lineHeight: 22, color: colors.muted },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF4FF',
    borderWidth: 2,
    borderColor: '#E6EEFF',
    borderRadius: 20,
    minHeight: 60,
    paddingStart: 8,
    paddingEnd: 14,
  },
  fieldFocus: { borderColor: colors.green, backgroundColor: '#FFFFFF' },
  fieldIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.ink,
  },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: {
    backgroundColor: '#EFF4FF',
    borderWidth: 2,
    borderColor: '#E6EEFF',
    borderRadius: 20,
    minHeight: 70,
    textAlign: 'center',
    fontFamily: fonts.heavy,
    fontSize: 30,
    letterSpacing: 10,
    color: colors.ink,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  linkText: { fontFamily: fonts.bold, fontSize: 15, color: colors.blueInk },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText: { fontSize: 12, lineHeight: 16, color: colors.muted },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE8E4',
    borderRadius: 16,
    padding: 12,
  },
  secret: {
    backgroundColor: colors.cream,
    padding: 16,
    borderRadius: 16,
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 30,
    textAlign: 'center',
  },
});
