import { Image, View } from 'react-native';
import type { CourseLesson } from '@lingvohero/contracts';
import { mediaSource } from '../content/client';
export function LessonImage({
  lesson,
  id,
  size = 110,
}: {
  lesson: CourseLesson;
  id: string;
  size?: number;
}) {
  const region = lesson.media.find((m) => m.id === id)!.region ?? {
    columns: 1,
    rows: 1,
    column: 0,
    row: 0,
  };
  const source = mediaSource(lesson, id);
  return (
    <View accessible={false} style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={typeof source === 'number' ? source : { uri: source }}
        style={{
          position: 'absolute',
          width: size * region.columns,
          height: size * region.rows,
          left: -size * region.column,
          top: -size * region.row,
        }}
      />
    </View>
  );
}
