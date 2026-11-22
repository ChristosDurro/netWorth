import { BookmarkPlus, Check, Link2, Printer, Share2 } from 'lucide-react';
import { useState } from 'react';
import { href } from '../../router';
import { Button, TextInput } from '../common/ui';

/** Absolute URL of an in-app path, for sharing. */
export function absoluteUrl(path: string): string {
  return typeof window === 'undefined' ? href(path) : new URL(href(path), window.location.origin).toString();
}

/** Native share sheet where available (phones), otherwise copy to clipboard. */
export function ShareButton({ path, title, text }: { path: string; title: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const share = async () => {
    const url = absoluteUrl(path);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (nav.share && coarse) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
      window.prompt('Copy this link', url);
    }
    setTimeout(() => setState('idle'), 2200);
  };
  return (
    <Button size="sm" onClick={share} aria-live="polite">
      {state === 'copied' ? <Check size={14} className="text-pos" /> : <Share2 size={14} />}
      {state === 'copied' ? 'Link copied' : 'Share'}
    </Button>
  );
}

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(absoluteUrl(path));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt('Copy this link', absoluteUrl(path));
        }
      }}
    >
      {copied ? <Check size={14} className="text-pos" /> : <Link2 size={14} />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

export function PrintButton({ label = 'Print / PDF' }: { label?: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => window.print()} title="Print or save as PDF">
      <Printer size={14} /> {label}
    </Button>
  );
}

export function SaveControl({ onSave, suggested, label = 'Save' }: { onSave: (name: string) => void; suggested: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => {
          setName(suggested);
          setOpen(true);
          setDone(false);
        }}
      >
        {done ? <Check size={14} className="text-pos" /> : <BookmarkPlus size={14} />}
        {done ? 'Saved' : label}
      </Button>
    );
  }
  return (
    <form
      className="flex w-full items-center gap-2 sm:w-72"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
        setOpen(false);
        setDone(true);
      }}
    >
      <label htmlFor="save-name" className="sr-only">
        Name for this calculation
      </label>
      <TextInput id="save-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[13px] sm:h-8" maxLength={120} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <Button size="sm" variant="primary" type="submit">
        Save
      </Button>
    </form>
  );
}
