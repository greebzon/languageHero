import type { DraftExercise, DraftWord } from '@lingvohero/contracts';
import { Field } from '../../components/ui';
import { mechanicFor } from '../../mechanics';

export function ExerciseForm({
  exercise,
  index,
  total,
  words,
  errors,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  exercise: DraftExercise;
  index: number;
  total: number;
  words: DraftWord[];
  errors: (path: string) => string[] | undefined;
  onChange: (exercise: DraftExercise) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
}) {
  const { label, Editor } = mechanicFor(exercise.type);
  return (
    <div className="exercise">
      <div className="exercise-head">
        <strong>
          {index + 1}. {label} <code>{exercise.id}</code>
        </strong>
        <span className="row">
          <button
            className="btn light sm"
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            className="btn light sm"
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button className="btn light sm" type="button" onClick={onDuplicate}>
            Дублировать
          </button>
          <button className="btn danger sm" type="button" onClick={onRemove}>
            Удалить
          </button>
        </span>
      </div>
      <div className="grid-2">
        <Field label="Вопрос ребёнку" hint="до 200 символов" error={errors('prompt')}>
          <input
            type="text"
            value={exercise.prompt}
            onChange={(e) => onChange({ ...exercise, prompt: e.target.value })}
          />
        </Field>
        <Field label="Подсказка Тима" hint="до 300 символов" error={errors('hint')}>
          <input
            type="text"
            value={exercise.hint}
            onChange={(e) => onChange({ ...exercise, hint: e.target.value })}
          />
        </Field>
      </div>

      <Editor exercise={exercise} words={words} errors={errors} onChange={onChange} />
    </div>
  );
}
