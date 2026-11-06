import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './Loaders.css';

/**
 * A grid of cells that lights up in a pattern while work runs, then settles
 * into a solid "done" (or "error") colour with the elapsed time.
 * Written to the props of the pasted usage; no source was provided for it.
 */
type Pattern = 'orbit' | 'wave' | 'scan' | 'random';

interface Props {
  status: 'working' | 'done' | 'error';
  label?: string;
  doneLabel?: string;
  errorLabel?: string;
  pattern?: Pattern;
  grid?: number;
  shape?: 'round' | 'square';
  doneColor?: string;
  errorColor?: string;
  cellSize?: number;
  gap?: number;
  fontSize?: number;
  step?: number;
  idleOpacity?: number;
  glow?: boolean;
  glowColor?: string;
  showTimer?: boolean;
  color?: string;
}

/** The order cells light in, for an n×n grid. */
function sequence(pattern: Pattern, n: number): number[][] {
  const all = Array.from({ length: n * n }, (_, i) => i);
  if (pattern === 'scan') return Array.from({ length: n }, (_, c) => all.filter(i => i % n === c));
  if (pattern === 'wave') return Array.from({ length: 2 * n - 1 }, (_, d) => all.filter(i => (i % n) + Math.floor(i / n) === d));
  if (pattern === 'random') return all.map(i => [i]).sort(() => Math.random() - 0.5);
  // orbit: walk the outer ring clockwise; the centre stays lit dimly
  const ring: number[] = [];
  for (let c = 0; c < n; c++) ring.push(c);
  for (let r = 1; r < n; r++) ring.push(r * n + n - 1);
  for (let c = n - 2; c >= 0; c--) ring.push((n - 1) * n + c);
  for (let r = n - 2; r > 0; r--) ring.push(r * n);
  return ring.map(i => [i]);
}

const fmt = (ms: number) => (ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);

export default function LatticeLoader({
  status,
  label = 'Thinking',
  doneLabel = 'Done in',
  errorLabel = 'Failed after',
  pattern = 'orbit',
  grid = 3,
  shape = 'round',
  doneColor = '#22c55e',
  errorColor = '#ef4444',
  cellSize = 6,
  gap = 2,
  fontSize = 14,
  step = 90,
  idleOpacity = 0.15,
  glow = false,
  glowColor = '',
  showTimer = true,
  color = 'currentColor'
}: Props) {
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(performance.now());
  const seq = useRef(sequence(pattern, grid));

  useEffect(() => {
    seq.current = sequence(pattern, grid);
  }, [pattern, grid]);

  useEffect(() => {
    if (status !== 'working') {
      setElapsed(performance.now() - started.current);
      return;
    }
    started.current = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setTick(t => t + 1);
      setElapsed(performance.now() - started.current);
    }, step);
    return () => window.clearInterval(id);
  }, [status, step]);

  const s = seq.current;
  const head = tick % s.length;
  const lit = new Map<number, number>();
  if (status === 'working') {
    // a short tail behind the head
    for (let k = 0; k < 3; k++) for (const i of s[(head - k + s.length) % s.length]) lit.set(i, Math.max(lit.get(i) ?? 0, 1 - k * 0.35));
  }
  const settled = status !== 'working';
  const tone = status === 'done' ? doneColor : status === 'error' ? errorColor : color;
  const text = status === 'working' ? label : status === 'done' ? doneLabel : errorLabel;

  return (
    <span className="lattice" data-status={status} style={{ fontSize, '--lt-tone': tone, '--lt-glow': glowColor || tone } as CSSProperties} role="status" aria-live="polite">
      <span className="lattice__grid" style={{ gridTemplateColumns: `repeat(${grid}, ${cellSize}px)`, gap }} aria-hidden="true">
        {Array.from({ length: grid * grid }, (_, i) => {
          const v = settled ? 1 : lit.get(i) ?? (pattern === 'orbit' && i === Math.floor((grid * grid) / 2) ? 0.35 : 0);
          return (
            <span
              key={i}
              className="lattice__cell"
              data-glow={glow && v > 0.6 ? '' : undefined}
              style={{ width: cellSize, height: cellSize, borderRadius: shape === 'round' ? '50%' : 1, opacity: Math.max(idleOpacity, v), transitionDelay: settled ? `${i * 18}ms` : '0ms' }}
            />
          );
        })}
      </span>
      <span className="lattice__label">
        {text}
        {showTimer && (settled || elapsed > 0) ? <span className="lattice__time"> {fmt(elapsed)}</span> : null}
      </span>
    </span>
  );
}
