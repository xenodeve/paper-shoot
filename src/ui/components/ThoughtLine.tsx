import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './Loaders.css';

/**
 * A one-line "thinking" status: the label breathes while work runs and the
 * steps tick through underneath; when it settles the line blurs into
 * "Thought for 3s" and the steps fold away (click to reopen).
 * Written to the props of the pasted usage; no source was provided for it.
 */
interface Props {
  working: boolean;
  steps?: string[];
  /** index of the step in progress; defaults to advancing on a timer */
  current?: number;
  label?: string;
  doneLabel?: string;
  glyph?: 'sparkle' | 'dot' | 'none';
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
  settleDuration?: number;
  settleBlur?: number;
  collapsible?: boolean;
  collapseOnSettle?: boolean;
  showTimer?: boolean;
  onSettle?: (seconds: number) => void;
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Z" fill="currentColor" />
      <path d="M19 15.5c.2 1.8 1.2 2.8 3 3-1.8.2-2.8 1.2-3 3-.2-1.8-1.2-2.8-3-3 1.8-.2 2.8-1.2 3-3Z" fill="currentColor" opacity=".6" />
    </svg>
  );
}

export default function ThoughtLine({
  working,
  steps = [],
  current,
  label = 'Thinking…',
  doneLabel = 'Thought for',
  glyph = 'sparkle',
  fontSize = 16,
  breathPeriod = 1.6,
  breathDepth = 0.45,
  settleDuration = 350,
  settleBlur = 2,
  collapsible = true,
  collapseOnSettle = true,
  showTimer = true,
  onSettle
}: Props) {
  const [open, setOpen] = useState(true);
  const [auto, setAuto] = useState(0);
  const [secs, setSecs] = useState(0);
  const t0 = useRef(performance.now());
  const was = useRef(working);
  const settleRef = useRef(onSettle);
  settleRef.current = onSettle;

  useEffect(() => {
    if (working) {
      t0.current = performance.now();
      setAuto(0);
      setOpen(true);
      const id = window.setInterval(() => {
        setSecs((performance.now() - t0.current) / 1000);
        setAuto(a => Math.min(steps.length - 1, a + (Math.random() < 0.35 ? 1 : 0)));
      }, 400);
      was.current = true;
      return () => window.clearInterval(id);
    }
    if (was.current) {
      const s = (performance.now() - t0.current) / 1000;
      setSecs(s);
      if (collapseOnSettle) setOpen(false);
      settleRef.current?.(Math.round(s * 10) / 10);
      was.current = false;
    }
  }, [working, steps.length, collapseOnSettle]);

  const at = current ?? auto;
  const shown = Math.max(1, Math.round(secs));
  return (
    <div
      className="thought"
      data-working={working ? '' : undefined}
      style={{ fontSize, '--tl-period': `${breathPeriod}s`, '--tl-depth': 1 - breathDepth, '--tl-settle': `${settleDuration}ms`, '--tl-blur': `${settleBlur}px` } as CSSProperties}
    >
      <button type="button" className="thought__head" disabled={!collapsible || working} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {glyph === 'sparkle' ? <span className="thought__glyph"><Sparkle /></span> : glyph === 'dot' ? <span className="thought__dot" /> : null}
        <span key={working ? 'w' : 'd'} className="thought__label">
          {working ? label : `${doneLabel} ${showTimer ? `${shown}s` : ''}`.trim()}
        </span>
        {working && showTimer ? <span className="thought__timer">{secs.toFixed(1)}s</span> : null}
        {!working && collapsible && steps.length ? <span className="thought__chev" data-open={open ? '' : undefined} aria-hidden="true">›</span> : null}
      </button>
      {steps.length ? (
        <div className="thought__body" data-open={open ? '' : undefined}>
          <ol className="thought__steps">
            {steps.map((s, i) => (
              <li key={s} data-state={!working || i < at ? 'done' : i === at ? 'now' : 'todo'}>
                {s}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
