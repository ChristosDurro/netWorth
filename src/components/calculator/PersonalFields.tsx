import { useId } from 'react';
import type { InputField, PersonalInputs } from '../../engine/types';
import { Field, Select, Switch, TextInput } from '../common/ui';

/** Renders a country's personal-circumstance fields from its module definition. */
export function PersonalFields({ fields, values, onChange, mode }: { fields: InputField[]; values: PersonalInputs; onChange: (key: string, value: string | number | boolean) => void; mode: 'simple' | 'advanced' }) {
  const prefix = useId();
  const visible = fields.filter((f) => mode === 'advanced' || !f.advanced);
  if (visible.length === 0) return null;
  const toggles = visible.filter((f) => f.type === 'boolean');
  const others = visible.filter((f) => f.type !== 'boolean');
  return (
    <div className="space-y-4">
      {others.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {others.map((f) => {
            const id = `${prefix}-${f.key}`;
            const v = values[f.key];
            if (f.type === 'select') {
              return (
                <Field key={f.key} label={f.label} help={f.help} htmlFor={id}>
                  <Select id={id} value={typeof v === 'string' ? v : f.default} onChange={(e) => onChange(f.key, e.target.value)}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            }
            if (f.type === 'number') {
              const n = typeof v === 'number' ? v : f.default;
              return (
                <Field key={f.key} label={f.label} help={f.help} htmlFor={id}>
                  <div className="relative">
                    <TextInput
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={n}
                      onChange={(e) => {
                        const x = e.target.valueAsNumber;
                        if (Number.isFinite(x)) onChange(f.key, Math.min(f.max, Math.max(f.min, x)));
                      }}
                      className={f.unit ? 'pr-9' : ''}
                    />
                    {f.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">{f.unit}</span>}
                  </div>
                </Field>
              );
            }
            return null;
          })}
        </div>
      )}
      {toggles.length > 0 && (
        <div className="space-y-3.5">
          {toggles.map((f) =>
            f.type === 'boolean' ? (
              <Switch key={f.key} label={f.label} description={f.help} checked={typeof values[f.key] === 'boolean' ? (values[f.key] as boolean) : f.default} onChange={(v) => onChange(f.key, v)} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
