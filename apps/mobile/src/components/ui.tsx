import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  AccessibilityInfo,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewStyle,
  type StyleProp,
  type ColorValue,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../theme';
import { useT } from '../i18n';

/* Arrows and chevrons point along the reading direction, so they turn around in Hebrew. */
const DIRECTIONAL = /^(arrow|chevron|caret)-(forward|back)|^(return|play-back|play-forward)/;

export function Label({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}
export function Heading({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.heading, style]} />;
}
export function Icon({
  name,
  color = colors.greenInk,
  size = 22,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  color?: ColorValue;
  size?: number;
}) {
  const { isRTL } = useT();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      style={isRTL && DIRECTIONAL.test(name) ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}
export function ToyButton({
  title,
  onPress,
  icon,
  tone = 'green',
  disabled = false,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  tone?: 'green' | 'amber' | 'light';
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const background =
    tone === 'amber' ? colors.amber : tone === 'light' ? colors.paper : colors.green;
  const edge =
    tone === 'amber' ? colors.amberDark : tone === 'light' ? colors.line : colors.greenDark;
  const foreground = tone === 'green' ? '#FFFFFF' : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toy,
        { backgroundColor: background, borderBottomColor: edge },
        disabled && { opacity: 0.45 },
        pressed && { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
        style,
      ]}
    >
      <Label style={[styles.buttonText, { color: foreground }]}>{title}</Label>
      {icon && <Icon name={icon} size={22} color={foreground} />}
    </Pressable>
  );
}
export function Tim({ size = 48 }: { size?: number }) {
  const { t } = useT();
  return (
    <Image
      accessibilityLabel={t('common.tim')}
      source={require('../../assets/images/tim.png')}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}
export function Animal({ id, size = 120 }: { id: string; size?: number }) {
  const index = ['fox', 'bear', 'rabbit', 'owl'].indexOf(id);
  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }} accessible={false}>
      <Image
        source={require('../../assets/images/animals.png')}
        style={{
          position: 'absolute',
          width: size * 2,
          height: size * 2,
          left: -(Math.max(0, index) % 2) * size,
          top: -Math.floor(Math.max(0, index) / 2) * size,
        }}
      />
    </View>
  );
}
export function Progress({ value, color = colors.green }: { value: number; color?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={styles.track}
    >
      <View
        style={[
          styles.fill,
          { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}
export function Badge({
  icon,
  value,
  tint = colors.cream,
  color = colors.amberDark,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  value: string | number;
  tint?: string;
  color?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: tint }]}>
      <Icon name={icon} size={18} color={color} />
      <Label style={[styles.badgeText, { color }]}>{value}</Label>
    </View>
  );
}
export function Appear({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: reduce ? 0 : 250,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [opacity, reduce]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
const styles = StyleSheet.create({
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text },
  heading: { fontFamily: fonts.heading, fontSize: 25, lineHeight: 32, color: colors.ink },
  toy: {
    minHeight: 58,
    borderRadius: 20,
    borderBottomWidth: 5,
    paddingHorizontal: 20,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: { fontFamily: fonts.heading, fontSize: 17 },
  track: { height: 12, backgroundColor: '#E2EBE4', borderRadius: 20, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 20 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: { fontFamily: fonts.heading, fontSize: 14, lineHeight: 20 },
});
