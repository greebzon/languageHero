import { router } from 'expo-router';
import { View } from 'react-native';
import { Heading, ToyButton } from '../src/components/ui';
import { useT } from '../src/i18n';
export default function NotFound() {
  const { t } = useT();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 24 }}>
      <Heading>{t('app.notFound.title')}</Heading>
      <ToyButton title={t('app.notFound.action')} onPress={() => router.replace('/')} />
    </View>
  );
}
