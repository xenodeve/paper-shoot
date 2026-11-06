import { useT } from '../../i18n';
import { settings, type Quality } from '../../profile';
import { useStore } from '../../store';
import { audio } from '../../game/audio';
import { speechSupported } from '../../voice';

export function KeyList() {
  const t = useT();
  const rows: [string[], string][] = [
    [['W', 'A', 'S', 'D'], 'keys.move'],
    [['Space'], 'keys.jump'],
    [['Shift'], 'keys.sprint'],
    [['C', 'Ctrl'], 'keys.crouch'],
    [['LMB', 'RMB'], 'keys.fire'],
    [['R'], 'keys.reload'],
    [['E'], 'keys.use'],
    [['Q'], 'slot.tactical'],
    [['Z'], 'slot.ultimate'],
    [['H'], 'keys.heal'],
    [['G', 'MMB'], 'keys.ping'],
    [['1', '2', '3', '4'], 'keys.weapons'],
    [['V'], 'keys.voice'],
    [['Esc'], 'keys.pause']
  ];
  return (
    <dl className="keys">
      {rows.map(([keys, label]) => (
        <div key={label}>
          <dt>
            {keys.map(k => (
              <span key={k} className="kbd">
                {k}
              </span>
            ))}
          </dt>
          <dd>{t(label)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SettingsPanel({ section }: { section: 'graphics' | 'audio' | 'controls' }) {
  const t = useT();
  const s = useStore(settings, x => x);
  return (
    <div className="settings">
      <section className="sheet settings__sheet enter" style={{ '--rot': '-0.4deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <h2 className="display">{t(`menu.${section}`)}</h2>

        {section === 'graphics' && (
          <>
            <div className="field">
              <span>{t('set.quality')}</span>
              <div className="seg">
                {(['auto', 'low', 'medium', 'high'] as Quality[]).map(q => (
                  <button key={q} type="button" aria-pressed={s.quality === q} onClick={() => settings.set({ quality: q })}>
                    {t(`set.quality.${q}`)}
                  </button>
                ))}
              </div>
            </div>
            <Row label={t('set.fps')} on={s.showFps} set={v => settings.set({ showFps: v })} />
            <Row label={t('set.boil')} on={s.lineBoil} set={v => settings.set({ lineBoil: v })} />
            <label className="field">
              <span>
                {t('set.fov')} · {s.fov}°
              </span>
              <input className="range" type="range" min={65} max={105} step={1} value={s.fov} onChange={e => settings.set({ fov: Number(e.target.value) })} />
            </label>
          </>
        )}

        {section === 'audio' && (
          <>
            <label className="field">
              <span>
                {t('set.volume')} · {Math.round(s.volume * 100)}%
              </span>
              <input
                className="range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.volume}
                onChange={e => {
                  const v = Number(e.target.value);
                  settings.set({ volume: v });
                  audio.setVolume(v);
                }}
                onPointerUp={() => {
                  audio.unlock();
                  audio.play('pistol');
                }}
              />
            </label>
            <Row label={t('set.voice')} on={s.voice} set={v => settings.set({ voice: v })} />
            <p className="muted">{speechSupported() ? t('set.voice.help') : t('set.voice.unsupported')}</p>
            <p className="voice-list">{t('set.voice.list')}</p>
          </>
        )}

        {section === 'controls' && (
          <>
            <label className="field">
              <span>
                {t('set.sens')} · {s.sensitivity.toFixed(2)}
              </span>
              <input className="range" type="range" min={0.2} max={3} step={0.05} value={s.sensitivity} onChange={e => settings.set({ sensitivity: Number(e.target.value) })} />
            </label>
            <Row label={t('set.invert')} on={s.invertY} set={v => settings.set({ invertY: v })} />
            <h3>{t('set.keys')}</h3>
            <KeyList />
          </>
        )}
      </section>
    </div>
  );
}

function Row({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="row-toggle">
      <button type="button" className="toggle" role="switch" aria-checked={on} onClick={() => set(!on)} />
      <span>{label}</span>
    </label>
  );
}
