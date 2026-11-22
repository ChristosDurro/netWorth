import { ChevronDown, Info } from 'lucide-react';
import { useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link } from '../../router';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

/* ── Surfaces ─────────────────────────────────────────────────────────── */

export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'aside' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('rounded-xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Section heading inside a card or page region. Sentence case, not shouty labels. */
export function SectionTitle({ children, hint, action, as: Tag = 'h2', id }: { children: ReactNode; hint?: ReactNode; action?: ReactNode; as?: 'h2' | 'h3'; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Tag id={id} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {children}
        </Tag>
        {hint && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Small overline used sparingly for page-level groups. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-xs font-medium uppercase tracking-[0.12em] text-accent', className)}>{children}</p>;
}

/* ── Buttons ──────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover border-transparent font-semibold',
  secondary: 'bg-surface text-ink border-line-strong hover:border-control hover:bg-surface-2',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-surface-2 border-transparent',
  danger: 'bg-transparent text-neg border-line-strong hover:bg-neg-soft',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
};
export const buttonClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) =>
  cx(
    'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg border font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    BUTTON_SIZES[size],
    BUTTON_VARIANTS[variant],
    extra,
  );

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({ to, variant = 'secondary', size = 'md', className, children, ...rest }: { to: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/* ── Form controls ────────────────────────────────────────────────────── */

export function Field({ label, help, error, children, htmlFor, tip, labelAction }: { label: string; help?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; tip?: string; labelAction?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
            {label}
          </label>
          {tip && <InfoTip text={tip} label={label} />}
        </span>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-neg" role="alert">
          {error}
        </p>
      ) : (
        help && <p className="mt-1.5 text-xs leading-relaxed text-faint">{help}</p>
      )}
    </div>
  );
}

const controlBase =
  'h-11 w-full rounded-lg border border-control/60 bg-surface px-3 text-[15px] text-ink transition-colors placeholder:text-faint hover:border-control focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-neg sm:h-10 sm:text-sm';

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlBase, 'cursor-pointer pr-9', className)} {...rest}>
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
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50', checked ? 'border-transparent bg-accent' : 'border-control/70 bg-surface-2')}
      >
        <span className={cx('absolute top-[3px] h-4 w-4 rounded-full transition-[left,background-color] duration-150', checked ? 'left-[23px] bg-accent-ink' : 'left-[3px] bg-faint')} />
      </button>
    </div>
  );
}

/** Radio group styled as a segmented control, with arrow-key navigation (WAI-ARIA radio pattern). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: 'sm' | 'md'; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex w-full rounded-lg bg-surface-2 p-1', size === 'sm' ? 'h-9' : 'h-11 sm:h-10', className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150',
            value === o.value ? 'bg-surface text-ink shadow-card ring-1 ring-line-strong/60' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Feedback ─────────────────────────────────────────────────────────── */

export type Tone = 'neutral' | 'accent' | 'pos' | 'warn' | 'neg';
const BADGE_TONES: Record<Tone, string> = {
  neutral: 'text-muted bg-surface-2',
  accent: 'text-accent bg-accent-soft',
  pos: 'text-pos bg-pos-soft',
  warn: 'text-warn bg-warn-soft',
  neg: 'text-neg bg-neg-soft',
};
export function Badge({ tone = 'neutral', children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = 'warn', children, icon }: { tone?: 'warn' | 'info' | 'neg'; children: ReactNode; icon?: ReactNode }) {
  const tones = {
    warn: 'border-warn/25 bg-warn-soft text-ink',
    info: 'border-line bg-surface-2 text-muted',
    neg: 'border-neg/30 bg-neg-soft text-ink',
  };
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={cx('flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Accessible toggle tip: click or focus to read; announced through aria-describedby. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`About ${label.toLowerCase()}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-faint hover:text-ink"
      >
        <Info size={13} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 animate-fade rounded-lg border border-line bg-elevated px-3 py-2 text-xs font-normal leading-relaxed text-ink shadow-pop">
          {text}
        </span>
      )}
    </span>
  );
}

/** Native <details> disclosure: works without JavaScript and in pre-rendered HTML. */
export function Disclosure({ summary, children, defaultOpen, className, onToggle }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; onToggle?: (open: boolean) => void }) {
  return (
    <details className={cx('group', className)} open={defaultOpen} onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg py-2 text-sm font-medium text-ink">
        <span className="min-w-0">{summary}</span>
        <ChevronDown size={16} className="shrink-0 text-faint transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="animate-fade pb-1 pt-2">{children}</div>
    </details>
  );
}

/** Label/value pair used in definition lists. */
export function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={cx('text-sm', strong ? 'font-semibold text-ink' : 'text-muted')}>{label}</dt>
      <dd className={cx('mono text-right text-sm', strong ? 'font-semibold text-ink' : 'text-ink')}>{children}</dd>
    </div>
  );
}
