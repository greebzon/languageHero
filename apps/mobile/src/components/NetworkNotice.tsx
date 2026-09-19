import { useNetworkState } from 'expo-network';
import { View } from 'react-native';
import { Icon, Label } from './ui';
import { colors } from '../theme';
import { useDemo } from '../state/DemoProvider';
import { useT } from '../i18n';

export function NetworkNotice() {
  const network = useNetworkState();
  const { storageError } = useDemo();
  const { t } = useT();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  if (!offline && !storageError) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.cream,
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Icon
        name={storageError ? 'alert-circle-outline' : 'cloud-offline-outline'}
        color={colors.amberDark}
        size={20}
      />
      <Label style={{ fontSize: 13, lineHeight: 18, flex: 1 }}>
        {storageError ? t('app.network.storage') : t('app.network.offline')}
      </Label>
    </View>
  );
}
