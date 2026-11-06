import { useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { BotAvatar } from 'bot-avatars';
import { Game } from '../game/Game';
import { hud } from '../game/hud';
import { audio } from '../game/audio';
import { useT } from '../i18n';
import { profile, settings, skillById } from '../profile';
import { useStore } from '../store';
import { listen, parseCommand } from '../voice';
import { Mascot, SkillGlyph } from './common';
import { GameOver } from './GameOver';
import { KeyList } from './panels/Settings';
import VoicePill from './components/VoicePill';
import type { WeaponId } from '../game/weapons';

export function Play({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const dmgRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [run, setRun] = useState(0);
  const phase = useStore(hud, h => h.phase);
  const voiceText = useRef('');
  const [heard, setHeard] = useState('');

  // one engine per run: settings and loadout are read fresh each time
  useEffect(() => {
    const s = settings.get();
    const p = profile.get();
    audio.setVolume(s.volume);
    let rec: { stop(): void } | null = null;
    const game = new Game({
      canvas: canvasRef.current!,
      look: p.look,
      tactical: skillById(p.loadout.tactical, 'tactical'),
      ultimate: skillById(p.loadout.ultimate, 'ultimate'),
      quality: s.quality,
      sensitivity: s.sensitivity,
      fov: s.fov,
      invertY: s.invertY,
      lineBoil: s.lineBoil,
      hooks: { crosshair: crossRef.current, hit: hitRef.current, dmgLayer: dmgRef.current, minimap: mapRef.current },
      onVoiceKey: down => {
        if (!settings.get().voice) return;
        if (down && !rec) {
          game.setListening(true);
          voiceText.current = '';
          rec = listen(
            settings.get().lang,
            text => {
              voiceText.current = text;
              setHeard(text);
            },
            () => {
              rec = null;
              game.setListening(false);
              const cmd = parseCommand(voiceText.current);
              if (cmd) game.command(cmd);
              setHeard(voiceText.current ? (cmd ? `✓ ${voiceText.current}` : `✗ ${voiceText.current}`) : '');
              window.setTimeout(() => setHeard(''), 1600);
            }
          );
        } else if (!down) rec?.stop();
      }
    });
    gameRef.current = game;
    // dev-only handle for automated play-testing; stripped from production builds
    if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = game;
    const unsub = settings.subscribe(() => {
      const x = settings.get();
      game.setOptions({ sensitivity: x.sensitivity, fov: x.fov, invertY: x.invertY, lineBoil: x.lineBoil });
      audio.setVolume(x.volume);
    });
    return () => {
      unsub();
      rec?.stop();
      game.dispose();
      gameRef.current = null;
    };
  }, [run]);

  // save the run once it ends
  const over = useStore(hud, h => h.summary);
  const savedFor = useRef<object | null>(null);
  useEffect(() => {
    if (!over || savedFor.current === over) return;
    savedFor.current = over;
    profile.set(p => ({ totalKills: p.totalKills + over.kills }));
  }, [over]);

  return (
    <div className="play" data-phase={phase}>
      <canvas ref={canvasRef} className="play__canvas" />
      <div ref={dmgRef} className="dmg-layer" aria-hidden="true" />
      <Hud crossRef={crossRef} hitRef={hitRef} mapRef={mapRef} heard={heard} />
      {phase === 'ready' && <ReadyCard onGo={() => gameRef.current?.start()} />}
      {phase === 'paused' && (
        <PauseCard
          onResume={() => gameRef.current?.resume()}
          onQuit={() => {
            onExit();
          }}
        />
      )}
      {phase === 'over' && over && (
        <GameOver
          summary={over}
          onAgain={() => {
            hud.set({ summary: null });
            setRun(r => r + 1);
          }}
          onMenu={onExit}
        />
      )}
    </div>
  );
}

function ReadyCard({ onGo }: { onGo: () => void }) {
  const t = useT();
  const look = useStore(profile, p => p.look);
  return (
    <div className="overlay">
      <button type="button" className="ready sheet enter" onClick={onGo} autoFocus>
        <Mascot look={look} size={96} state="working" />
        <strong className="display">{t('hud.clickToAim')}</strong>
        <span className="tiny">WASD · Shift · Space · C · R · E · Q · Z · H · G · V</span>
      </button>
    </div>
  );
}

function PauseCard({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  const t = useT();
  const s = useStore(settings, x => x);
  return (
    <div className="overlay">
      <div className="pause sheet sheet--ruled enter" style={{ '--rot': '-0.8deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <span className="tape tape--tr" />
        <h2 className="display">{t('hud.paused')}</h2>
        <div className="pause__cols">
          <div className="pause__opts">
            <label className="field">
              <span>
                {t('set.sens')} · {s.sensitivity.toFixed(2)}
              </span>
              <input className="range" type="range" min={0.2} max={3} step={0.05} value={s.sensitivity} onChange={e => settings.set({ sensitivity: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>
                {t('set.volume')} · {Math.round(s.volume * 100)}%
              </span>
              <input className="range" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={e => settings.set({ volume: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>
                {t('set.fov')} · {s.fov}°
              </span>
              <input className="range" type="range" min={65} max={105} step={1} value={s.fov} onChange={e => settings.set({ fov: Number(e.target.value) })} />
            </label>
            <div className="field">
              <span>{t('set.lang')}</span>
              <div className="seg">
                {(['th', 'en'] as const).map(l => (
                  <button key={l} type="button" aria-pressed={s.lang === l} onClick={() => settings.set({ lang: l })}>
                    {l === 'th' ? 'ไทย' : 'EN'}
                  </button>
                ))}
              </div>
            </div>
            <p className="tiny">{t('set.voice.list')}</p>
          </div>
          <KeyList />
        </div>
        <div className="pause__actions">
          <button type="button" className="btn btn--primary" onClick={onResume} autoFocus>
            {t('hud.resume')}
          </button>
          <button type="button" className="btn" onClick={onQuit}>
            {t('hud.quit')}
          </button>
        </div>
      </div>
    </div>
  );
}

const WEAPON_ICON: Record<WeaponId, string> = { pencil: '✏️', stapler: '📎', punch: '⭕', ruler: '📏' };

function Hud({ crossRef, hitRef, mapRef, heard }: { crossRef: React.RefObject<HTMLDivElement | null>; hitRef: React.RefObject<HTMLDivElement | null>; mapRef: React.RefObject<HTMLCanvasElement | null>; heard: string }) {
  const t = useT();
  const h = useStore(hud, x => x);
  const look = useStore(profile, p => p.look);
  const showFps = useStore(settings, s => s.showFps);
  const inMatch = h.phase === 'playing' || h.phase === 'paused' || h.phase === 'dead';
  const hpPct = (h.hp / h.hpMax) * 100;
  const shPct = h.shieldMax ? (h.shield / h.shieldMax) * 100 : 0;
  const cells = h.shieldMax / 25;
  const ringKey = h.intermission > 0 ? null : `hud.ring.${h.ringPhase}`;
  const lastCallout = h.callouts[h.callouts.length - 1];

  return (
    <div className="hud" data-on={inMatch ? '' : undefined} data-low={h.lowHp ? '' : undefined} data-outside={h.outside ? '' : undefined}>
      <div className="hud__vignette" aria-hidden="true" />
      <div className="hud__storm" aria-hidden="true" />

      {/* top centre: score, combo, wave */}
      <div className="hud__top">
        <div className="score-card">
          <div className="score-card__wave">
            <span className="tiny">{t('hud.wave')}</span>
            <strong className="display tnum">{h.wave}</strong>
          </div>
          <div className="score-card__main">
            <strong className="display tnum score-card__score">{h.score.toLocaleString()}</strong>
            <div className="combo" data-on={h.combo > 1 ? '' : undefined}>
              <span className="combo__x display">×{h.combo.toFixed(2).replace(/\.?0+$/, '')}</span>
              <span className="combo__bar">
                <span style={{ transform: `scaleX(${h.comboT})` }} />
              </span>
            </div>
          </div>
          <div className="score-card__left">
            <strong className="display tnum">{h.enemiesLeft}</strong>
            <span className="tiny">{t('hud.left')}</span>
          </div>
        </div>
        <div className="ring-tag" data-phase={h.ringPhase}>
          {h.intermission > 0 ? (
            <>
              {t('hud.next')} <strong className="tnum">{h.intermission}s</strong>
            </>
          ) : ringKey ? (
            <>
              {t(ringKey)}
              {h.ringPhase !== 'calm' ? <strong className="tnum"> {h.ringTime}s</strong> : null}
            </>
          ) : null}
        </div>
        <div className="popups" aria-live="polite">
          {h.popups.map(p => (
            <div key={p.id} className="popup" data-tone={p.tone}>
              {p.key === 'score.combo' ? `${t(p.key)} ×${p.value}` : `+${p.value.toLocaleString()} ${t(p.key)}`}
            </div>
          ))}
        </div>
      </div>

      {/* top left: kill feed */}
      <ul className="feed">
        {h.killfeed.map(k => (
          <li key={k.id} data-eye={k.eye ? '' : undefined}>
            <span className="feed__by">{k.weapon === 'skill' ? '✦' : WEAPON_ICON[k.weapon as WeaponId] ?? '•'}</span>
            <BotAvatar type={k.type} size={22} shading="flat" paused interactive={false} theme="light" hat={k.elite ? 'crown' : 'none'} accessoryColor="#e0a82e" />
            <span>{t(`enemy.${k.kind}`)}</span>
            {k.eye ? <span className="feed__eye">{t('hud.eye')}</span> : null}
          </li>
        ))}
      </ul>

      {/* top right: map + fps */}
      <div className="hud__map">
        <canvas ref={mapRef} width={168} height={168} className="minimap" />
        {showFps ? (
          <span className="fps tnum">
            {h.fps} {t('hud.fps')} · ×{h.scale.toFixed(2)}
          </span>
        ) : null}
      </div>

      {/* centre: crosshair, hit marker, prompt, heal channel */}
      <div ref={crossRef} className="cross" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div ref={hitRef} className="hitmark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      {h.damageDirs.map(d => (
        <div key={d.id} className="dmg-dir" style={{ transform: `translate(-50%, -50%) rotate(${d.angle}rad)` }} aria-hidden="true">
          <span />
        </div>
      ))}
      {h.prompt ? (
        <div className="prompt">
          <span className="kbd">E</span> {t(h.prompt.key)}
          {h.prompt.arg ? ` ${t(`weapon.${h.prompt.arg}`)}` : ''}
        </div>
      ) : null}
      {h.healing ? (
        <div className="channel">
          <span>{t(h.healing.kind === 'tape' ? 'hud.healTape' : 'hud.healGlue')}</span>
          <span className="channel__bar">
            <span style={{ transform: `scaleX(${h.healing.p})` }} />
          </span>
        </div>
      ) : h.reload > 0 ? (
        <div className="channel">
          <span>{t('hud.reloading')}</span>
          <span className="channel__bar">
            <span style={{ transform: `scaleX(${h.reload})` }} />
          </span>
        </div>
      ) : null}
      {h.outside ? <div className="warn">{t('hud.outside')}</div> : null}
      {h.phase === 'dead' ? <div className="down display">{t('hud.down')}</div> : null}

      {/* bottom left: you */}
      <div className="me">
        {lastCallout ? (
          <div key={lastCallout.id} className="bubble">
            {t(lastCallout.key)}
          </div>
        ) : null}
        <div className="me__card sheet">
          <div className="me__face">
            <Mascot look={look} size={58} shading="crisp" interactive={false} state={h.phase === 'dead' ? 'sleeping' : h.lowHp ? 'working' : 'default'} />
          </div>
          <div className="me__bars">
            <div className="shield" data-tier={h.shieldTier}>
              <span className="shield__fill" style={{ width: `${shPct}%` }} />
              {Array.from({ length: cells - 1 }, (_, i) => (
                <span key={i} className="shield__tick" style={{ left: `${((i + 1) / cells) * 100}%` }} />
              ))}
            </div>
            <div className="hp">
              <span className="hp__fill" style={{ width: `${hpPct}%` }} />
              <span className="hp__num tnum">{h.hp}</span>
            </div>
            <div className="me__items">
              <span title="tape">
                🩹 <b className="tnum">{h.tape}</b>
              </span>
              <span title="glue">
                🧴 <b className="tnum">{h.glue}</b>
              </span>
              <span className="kbd">H</span>
            </div>
          </div>
        </div>
      </div>

      {/* bottom centre: skills + voice */}
      <div className="skills">
        {(['tactical', 'ultimate'] as const).map(slot => {
          const s = h[slot];
          const ready = s.cd <= 0;
          const pct = s.cdMax ? 1 - s.cd / s.cdMax : 1;
          return (
            <div key={slot} className="skill" data-ready={ready ? '' : undefined} data-slot={slot} style={{ '--skill': s.color, '--p': pct } as React.CSSProperties}>
              <span className="skill__ring" />
              <span className="skill__icon">
                <SkillGlyph icon={s.icon} size={slot === 'ultimate' ? 26 : 22} color={ready ? '#fff' : '#1f2a44'} />
              </span>
              <span className="skill__cd tnum">{ready ? '' : Math.ceil(s.cd)}</span>
              <span className="kbd skill__key">{slot === 'tactical' ? 'Q' : 'Z'}</span>
              <span className="skill__name">{s.name}</span>
            </div>
          );
        })}
        <div className="buffs">
          {h.buffs.map((b, i) => (
            <span key={i} className="buff" style={{ '--skill': b.color } as React.CSSProperties}>
              {t(`stat.${b.stat}`)} {Math.ceil(b.t)}s
            </span>
          ))}
        </div>
      </div>
      <div className="voice" data-on={h.listening || heard ? '' : undefined}>
        {h.listening ? <ThinkingOrb state="listening" size={32} theme="light" color="#1f2a44" /> : null}
        <span>{h.listening ? heard || t('hud.listening') : heard}</span>
        <span className="voice__pill">
          <VoicePill size={30} showTime={false} waveform={false} slideToCancel={false} background="#fbf7ec" iconColor="#1f2a44" accentColor="#e5533d" disabled ariaLabel="V" />
          <span className="kbd">V</span>
        </span>
      </div>

      {/* bottom right: weapon */}
      <div className="gun sheet">
        <div className="gun__name display">{t(`weapon.${h.weapon}`)}</div>
        <div className="gun__ammo">
          <strong className="display tnum" data-low={h.mag <= Math.ceil(h.magMax * 0.25) ? '' : undefined}>
            {h.mag}
          </strong>
          <span className="tnum">/ {h.reserve === Infinity ? '∞' : h.reserve}</span>
        </div>
        <div className="gun__slots">
          {h.owned.map((w, i) => (
            <span key={w.id} className="gun__slot" aria-current={w.id === h.weapon ? 'true' : undefined} title={t(`weapon.${w.id}`)}>
              <span className="kbd">{['pencil', 'stapler', 'punch', 'ruler'].indexOf(w.id) + 1 || i + 1}</span>
              {WEAPON_ICON[w.id]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
