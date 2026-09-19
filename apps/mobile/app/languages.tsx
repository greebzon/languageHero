import { StyleSheet, View } from 'react-native';
import { Screen } from '../src/components/Screen';
import { LanguagePicker } from '../src/components/LanguagePicker';
import { goTo } from '../src/components/SideMenu';
import { Heading, ToyButton } from '../src/components/ui';
import { useT } from '../src/i18n';

/** «Языки» from the side menu: switch the learning language or add another one. */
export default function LanguagesScreen() {
  const { t } = useT();
  return (
    <Screen>
      <View style={s.page}>
        <ToyButton
          title={t('course.allWorlds')}
          tone="light"
          icon="arrow-back"
          onPress={() => goTo('/')}
        />
        <Heading style={s.title}>{t('languages.title')}</Heading>
        <LanguagePicker mode="screen" onPicked={() => goTo('/')} />
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  title: { fontSize: 28, lineHeight: 34 },
});
