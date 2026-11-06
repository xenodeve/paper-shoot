import { useEffect, useRef, useState } from 'react';
import type { Summary } from '../game/hud';
import { useT } from '../i18n';
import { bestScore, profile } from '../profile';
import { useStore } from '../store';
import { Mascot } from './common';
import { audio } from '../game/audio';

/** Counts up like a tally being added, eased so the big digits settle last. */
function useCount(target: number, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function GameOver({ summary, onAgain, onMenu }: { summary: Summary; onAgain: () => void; onMenu: () => void }) {
  const t = useT();
  const look = useStore(profile, p => p.look);
  const [prevBest] = useState(() => bestScore());
  const isBest = summary.score > prevBest;
  const shown = useCount(summary.score);
  const [name, setName] = useState(look.name);
  const saved = useRef(false);

  const commit = () => {
    if (saved.current) return;
    saved.current = true;
    const entry = { name: name.trim() || look.name, score: summary.score, wave: summary.wave, kills: summary.kills, at: Date.now(), type: look.type };
    profile.set(p => ({ scores: [...p.scores, entry].sort((a, b) => b.score - a.score).slice(0, 10) }));
  };

  useEffect(() => {
    audio.play(isBest ? 'wave' : 'kill');
  }, [isBest]);

  const acc = summary.shots ? Math.round((summary.hits / summary.shots) * 100) : 0;
  const mins = Math.floor(summary.time / 60);
  const secs = Math.floor(summary.time % 60);
  const stats: [string, string][] = [
    ['over.wave', String(summary.wave)],
    ['over.kills', String(summary.kills)],
    ['over.eye', String(summary.eyeshots)],
    ['over.acc', `${acc}%`],
    ['over.combo', `×${summary.bestCombo.toFixed(2).replace(/\.?0+$/, '')}`],
    ['over.time', `${mins}:${String(secs).padStart(2, '0')}`]
  ];
  const max = Math.max(1, ...summary.breakdown.map(b => b.value));

  return (
    <div className="overlay overlay--solid">
      <div className="desk" aria-hidden="true" />
      <div className="over sheet sheet--ruled enter" style={{ '--rot': '-1deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <span className="tape tape--tr" />
        <header className="over__head">
          <Mascot look={look} size={88} state="sleeping" />
          <div>
            <h2 className="display">{t('over.title')}</h2>
            <strong className="over__score display tnum">{shown.toLocaleString()}</strong>
            {isBest ? <span className="stamp display">{t('over.newBest')}</span> : null}
          </div>
        </header>
        <dl className="over__stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt className="tiny">{t(k)}</dt>
              <dd className="display tnum">{v}</dd>
            </div>
          ))}
        </dl>
        <section className="over__breakdown">
          <h3>{t('over.breakdown')}</h3>
          {summary.breakdown.map(b => (
            <div key={b.key} className="bar-row">
              <span>{t(b.key)}</span>
              <span className="bar-row__track">
                <span style={{ width: `${(b.value / max) * 100}%` }} />
              </span>
              <span className="tnum">{b.value.toLocaleString()}</span>
            </div>
          ))}
        </section>
        <footer className="over__foot">
          <label className="field">
            <span>{t('over.name')}</span>
            <input className="input" value={name} maxLength={16} onChange={e => setName(e.target.value.replace(/[<>]/g, ''))} />
          </label>
          <div className="over__actions">
            <button
              type="button"
              className="btn btn--primary"
              autoFocus
              onClick={() => {
                commit();
                onAgain();
              }}
            >
              {t('over.again')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                commit();
                onMenu();
              }}
            >
              {t('over.menu')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
