import type { ReactNode } from 'react';

/**
 * Small inline SVG flags. Emoji flags do not render on Windows, so the
 * supported countries get real artwork and anything else falls back to its code.
 */
const cross = (bg: string, fg: string, inner?: string): ReactNode => (
  <>
    <rect width="28" height="20" fill={bg} />
    <rect x="8" width="4" height="20" fill={fg} />
    <rect y="8" width="28" height="4" fill={fg} />
    {inner && (
      <>
        <rect x="9" width="2" height="20" fill={inner} />
        <rect y="9" width="28" height="2" fill={inner} />
      </>
    )}
  </>
);
const stripes = (a: string, b: string, c: string): ReactNode => (
  <>
    <rect width="28" height="6.67" fill={a} />
    <rect y="6.67" width="28" height="6.67" fill={b} />
    <rect y="13.33" width="28" height="6.67" fill={c} />
  </>
);

const FLAGS: Record<string, ReactNode> = {
  DK: cross('#C8102E', '#fff'),
  SE: cross('#006AA7', '#FECC02'),
  NO: cross('#BA0C2F', '#fff', '#00205B'),
  DE: stripes('#000', '#DD0000', '#FFCE00'),
  NL: stripes('#AE1C28', '#fff', '#21468B'),
  GR: (
    <>
      <rect width="28" height="20" fill="#0D5EAF" />
      {[1, 3, 5, 7].map((i) => (
        <rect key={i} y={(i * 20) / 9} width="28" height={20 / 9} fill="#fff" />
      ))}
      <rect width="11.1" height="11.1" fill="#0D5EAF" />
      <rect x="4.44" width="2.22" height="11.1" fill="#fff" />
      <rect y="4.44" width="11.1" height="2.22" fill="#fff" />
    </>
  ),
};

export function Flag({ code, className = 'h-4 w-[22px]' }: { code: string; className?: string }) {
  const art = FLAGS[code];
  if (!art) {
    return <span className={`inline-flex items-center justify-center rounded-[3px] bg-surface-2 text-[9px] font-bold text-muted ring-1 ring-line ${className}`}>{code}</span>;
  }
  return (
    <svg viewBox="0 0 28 20" className={`shrink-0 rounded-[3px] ring-1 ring-black/10 ${className}`} aria-hidden="true">
      {art}
    </svg>
  );
}
