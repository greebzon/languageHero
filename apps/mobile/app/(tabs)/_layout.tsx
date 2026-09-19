import { Tabs } from 'expo-router';
import { Icon } from '../../src/components/ui';
import { colors, fonts } from '../../src/theme';
import { useT } from '../../src/i18n';

export default function TabsLayout() {
  const { t } = useT();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.greenInk,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          minHeight: 76,
          paddingTop: 10,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11, marginTop: 3 },
        tabBarItemStyle: { minHeight: 56 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('app.tabs.worlds'),
          tabBarIcon: ({ color }) => <Icon name="compass-outline" color={color} size={25} />,
        }}
      />
      <Tabs.Screen
        name="words"
        options={{
          title: t('app.tabs.words'),
          tabBarIcon: ({ color }) => <Icon name="book-outline" color={color} size={25} />,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: t('app.tabs.rewards'),
          tabBarIcon: ({ color }) => <Icon name="ribbon-outline" color={color} size={25} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('app.tabs.profile'),
          tabBarIcon: ({ color }) => <Icon name="person-outline" color={color} size={25} />,
        }}
      />
    </Tabs>
  );
}
