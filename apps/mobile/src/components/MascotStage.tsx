import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import type { MascotSlot, Outfit } from '@lingvohero/contracts';
import { outfitLayers } from '@lingvohero/learning-core';
import { MascotFace } from './MascotPicker';
import { mascotOf, shopImage, useShopCatalog } from '../content/shop';
import { useLocale } from '../i18n';
import { mascotText } from '../i18n/content';

/* One outfit layer: appears with a small bounce (0.8 → 1.05 → 1) when it is put on. */
function Layer({ path, width, height }: { path: string; width: number; height: number }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.05, duration: 220, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);
  return (
    <Animated.Image
      source={shopImage(path)}
      resizeMode="contain"
      style={[s.fill, { width, height, opacity, transform: [{ scale }] }]}
    />
  );
}
/**
 * The mascot with what it wears: the body picture and one pre-fitted layer per equipped item,
 * bottom to top. Clothes are a whole-character picture (the mascot already dressed) and are
 * drawn instead of the body. A preview item temporarily takes its slot. Everything is sized
 * from `width`, so the same component serves the profile, the shop and the fitting room.
 * Mascots without a generated body (the bundled fallback) show their portrait instead.
 */
export function MascotStage({
  mascotId,
  outfit,
  preview,
  width = 220,
  pedestal = true,
}: {
  mascotId: string;
  outfit: Outfit;
  preview?: { id: string; slot: MascotSlot } | null;
  width?: number;
  pedestal?: boolean;
}) {
  const catalog = useShopCatalog();
  const { locale } = useLocale();
  const mascot = mascotOf(mascotId, catalog);
  const height = Math.round(width * 1.5);
  const layers = outfitLayers(outfit, catalog.layers, mascot.id, preview);
  const dressed = layers.find((l) => l.slot === 'outfit');
  const picture = dressed ? dressed.layer.path : mascot.body;
  const base = pedestal ? Math.round(width * 0.14) : 0;
  return (
    /* Layers are painted to fit the body in its own coordinates: never mirrored in RTL. */
    <View
      style={{ width, height: height + base, direction: 'ltr' }}
      accessible
      accessibilityLabel={mascotText(mascot, locale).name}
    >
      {pedestal && <View style={[s.beam, { width: width * 0.8, left: width * 0.1, height }]} />}
      {pedestal && (
        <View
          style={[
            s.disc,
            {
              width: width * 0.86,
              height: base * 1.6,
              left: width * 0.07,
              top: height - base * 0.5,
            },
          ]}
        />
      )}
      {mascot.body ? (
        <Image
          key={picture}
          source={shopImage(picture)}
          resizeMode="contain"
          style={[s.fill, { width, height }]}
        />
      ) : (
        <View style={[s.fill, { width, height, alignItems: 'center', justifyContent: 'center' }]}>
          <MascotFace id={mascot.id} size={Math.round(width * 0.78)} />
        </View>
      )}
      {mascot.body
        ? layers
            .filter((l) => l !== dressed)
            .map(({ itemId, layer }) => (
              <Layer key={itemId} path={layer.path} width={width} height={height} />
            ))
        : null}
    </View>
  );
}
const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0 },
  beam: {
    position: 'absolute',
    top: 0,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: 'rgba(54,182,251,0.12)',
  },
  disc: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#8FD3FF',
    borderBottomWidth: 6,
    borderBottomColor: '#3AA9E0',
  },
});
