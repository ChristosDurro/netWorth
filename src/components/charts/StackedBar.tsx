import { formatPercent, type FormatPrefs } from '../../utils/format';

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Horizontal 100% bar: how gross pay splits into take-home pay and deductions.
 * Plain DOM so it is accessible, themeable and adds no chart dependency.
 */
export function StackedBar({ segments, total, prefs, label }: { segments: Segment[]; total: number; prefs: FormatPrefs; label: string }) {
  const visible = segments.filter((s) => s.value > 0 && total > 0);
  return (
    <figure className="m-0">
      <div role="img" aria-label={`${label}: ${visible.map((s) => `${s.label} ${formatPercent(s.value / total, prefs)}`).join(', ')}`} className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2">
        {visible.map((s) => (
          <div key={s.key} className="h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${formatPercent(s.value / total, prefs)}`} />
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
            <span className="num font-medium text-ink">{formatPercent(s.value / total, prefs)}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Colours per deduction category; net pay uses the positive token. */
export const SEGMENT_COLORS = {
  net: 'var(--pos)',
  incomeTax: 'var(--accent)',
  social: '#8b5cf6',
  mandatory: '#f59e0b',
  optional: '#64748b',
} as const;
