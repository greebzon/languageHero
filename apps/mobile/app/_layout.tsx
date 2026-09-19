import { useMemo, useState } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Rubik_700Bold } from '@expo-google-fonts/rubik/700Bold';
import { Rubik_800ExtraBold } from '@expo-google-fonts/rubik/800ExtraBold';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_800ExtraBold } from '@expo-google-fonts/nunito-sans/800ExtraBold';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'react-native-drawer-layout';
import { DemoProvider } from '../src/state/DemoProvider';
import { colors } from '../src/theme';
import { AccountProvider, useAccount } from '../src/account/AccountProvider';
import { LocaleProvider, useLocale } from '../src/i18n';
import { LaunchGate } from '../src/navigation/LaunchGate';
import { DrawerProvider } from '../src/navigation/DrawerContext';
import { LevelNotice } from '../src/components/LevelNotice';
import { SideMenu } from '../src/components/SideMenu';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Rubik_700Bold,
    Rubik_800ExtraBold,
    NunitoSans_600SemiBold,
    NunitoSans_800ExtraBold,
  });
  if (!loaded && !error)
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LocaleProvider>
          <AccountProvider>
            <SignedInApp />
          </AccountProvider>
        </LocaleProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
function SignedInApp() {
  const { account } = useAccount();
  return (
    <DemoProvider key={account!.profile.id}>
      <StatusBar style="dark" />
      <LaunchGate>
        <AppDrawer>
          <LevelNotice />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'fade',
              gestureEnabled: false,
            }}
          />
        </AppDrawer>
      </LaunchGate>
    </DemoProvider>
  );
}
/* The side menu: ☰ in the headers or a swipe from the edge (not inside a lesson, where a stray
   swipe must not pull the child out of it). It opens from the reading side. */
function AppDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { isRTL } = useLocale();
  const pathname = usePathname();
  const controls = useMemo(() => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);
  const swipe = pathname !== '/lesson' && pathname !== '/result';
  return (
    <DrawerProvider value={controls}>
      <Drawer
        open={open}
        onOpen={controls.open}
        onClose={controls.close}
        drawerType="front"
        drawerPosition={isRTL ? 'right' : 'left'}
        swipeEnabled={swipe}
        drawerStyle={{ width: 300, backgroundColor: colors.background }}
        renderDrawerContent={() => <SideMenu onClose={controls.close} />}
      >
        {children}
      </Drawer>
    </DrawerProvider>
  );
}
