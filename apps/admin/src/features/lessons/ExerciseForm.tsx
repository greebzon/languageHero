import type { DraftExercise, DraftMedia, DraftWord } from '@lingvohero/contracts';
import { Field } from '../../components/ui';
import { mechanicFor } from '../../mechanics';

export function ExerciseForm({
  exercise,
  index,
  total,
  words,
  media,
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
  media: DraftMedia[];
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

      <Field
        label="Для возраста"
        hint="задание только для одной группы — например, фраза попроще для 6–7 лет"
        error={errors('ageBands')}
      >
        <select
          value={exercise.ageBands?.join(',') ?? ''}
          onChange={(e) => {
            const { ageBands: _all, ...rest } = exercise;
            onChange(
              e.target.value
                ? { ...rest, ageBands: [e.target.value as '6-7' | '8-9'] }
                : (rest as DraftExercise),
            );
          }}
        >
          <option value="">для всех</option>
          <option value="6-7">6–7 лет</option>
          <option value="8-9">8–9 лет и старше</option>
        </select>
      </Field>
      <Editor exercise={exercise} words={words} media={media} errors={errors} onChange={onChange} />
    </div>
  );
}
