import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { CountryInfo } from '../../engine/registry';
import { Flag } from '../common/Flag';
import { cx } from '../common/ui';

/** Accessible listbox with country flags (native <select> cannot show images). */
export function CountryPicker({ countries, value, onChange, label = 'Employment country', id }: { countries: CountryInfo[]; value: string; onChange: (code: string) => void; label?: string; id?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const autoId = useId();
  const buttonId = id ?? `${autoId}-btn`;
  const listId = `${autoId}-list`;
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = countries.find((c) => c.code === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, countries.findIndex((c) => c.code === value)));
      requestAnimationFrame(() => list.current?.focus());
    }
  }, [open, countries, value]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(countries.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(countries.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(countries[active].code);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') document.getElementById(buttonId)?.focus();
      return;
    } else {
      const i = countries.findIndex((c) => c.name.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
      else return;
    }
    e.preventDefault();
  };

  return (
    <div ref={root} className="relative">
      <button
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selected?.name ?? 'none'}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 text-left text-sm text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
      >
        {selected && <Flag code={selected.code} />}
        <span className="flex-1 truncate font-medium">{selected?.name ?? 'Select a country'}</span>
        {selected && <span className="text-xs text-faint">{selected.currency}</span>}
        <ChevronDown size={16} className="text-faint" />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${countries[active]?.code}`}
          onKeyDown={onListKey}
          className="absolute z-40 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-card focus:outline-none"
        >
          {countries.map((c, i) => (
            <li
              key={c.code}
              id={`${listId}-${c.code}`}
              role="option"
              aria-selected={c.code === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c.code)}
              className={cx('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm', i === active ? 'bg-surface-2 text-ink' : 'text-muted')}
            >
              <Flag code={c.code} />
              <span className="flex-1 font-medium text-ink">{c.name}</span>
              <span className="text-xs text-faint">{c.currency}</span>
              {c.code === value && <Check size={14} className="text-accent" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
