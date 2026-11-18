import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
        {hint && <p className="mt-1 text-sm text-faint">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-accent-ink hover:brightness-110 border-transparent font-semibold',
    secondary: 'bg-surface-2 text-ink hover:border-line-strong border-line',
    ghost: 'bg-transparent text-muted hover:text-ink hover:bg-surface-2 border-transparent',
    danger: 'bg-transparent text-neg hover:bg-surface-2 border-line',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-4 text-sm',
        styles[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function Field({ label, help, children, htmlFor }: { label: string; help?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {help && <p className="mt-1.5 text-xs leading-relaxed text-faint">{help}</p>}
    </div>
  );
}

const controlBase = 'h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none';

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlBase, 'cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlBase, className)} {...rest} />;
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-faint">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50', checked ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-2')}
      >
        <span className={cx('absolute top-[3px] h-4 w-4 rounded-full transition-all', checked ? 'left-[23px] bg-accent-ink' : 'left-[3px] bg-muted')} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex w-full rounded-lg border border-line bg-surface-2 p-0.5', size === 'sm' ? 'h-8' : 'h-10')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-md px-3 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'accent' | 'pos' | 'warn' | 'neg'; children: ReactNode; title?: string }) {
  const tones = {
    neutral: 'border-line text-muted bg-surface-2',
    accent: 'border-transparent text-accent bg-accent-soft',
    pos: 'border-transparent text-pos bg-[color-mix(in_srgb,var(--pos)_12%,transparent)]',
    warn: 'border-transparent text-warn bg-warn-soft',
    neg: 'border-transparent text-neg bg-[color-mix(in_srgb,var(--neg)_12%,transparent)]',
  };
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}

export function Notice({ tone = 'warn', children, icon }: { tone?: 'warn' | 'info' | 'neg'; children: ReactNode; icon?: ReactNode }) {
  const tones = {
    warn: 'border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-warn-soft text-ink',
    info: 'border-line bg-surface-2 text-muted',
    neg: 'border-[color-mix(in_srgb,var(--neg)_35%,transparent)] bg-[color-mix(in_srgb,var(--neg)_8%,transparent)] text-ink',
  };
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={cx('flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
