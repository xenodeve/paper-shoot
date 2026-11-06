import { BotAvatar, botAvatarPalette, botAvatarTypes, type BotAvatarType } from 'bot-avatars';
import { useT } from '../../i18n';
import { isUnlocked, profile, UNLOCKS, type Look } from '../../profile';
import { useStore } from '../../store';
import { Mascot } from '../common';
import { audio } from '../../game/audio';

const BODY_COLORS = ['', '#e5533d', '#f08a24', '#ffd84a', '#2f9e5b', '#2bb3a3', '#3b82c4', '#8a5cc8', '#f29bb0', '#fbf7ec', '#1f2a44'];
const ACCENTS = ['#2b2b33', '#e5533d', '#e0a82e', '#2f9e5b', '#3b82c4', '#8a5cc8', '#fbf7ec'];
const HATS: Look['hat'][] = ['none', 'beanie', 'beret', 'party', 'crown'];
const GLASSES: Look['glasses'][] = ['none', 'round', 'square', 'shades'];

export function LockerPanel() {
  const t = useT();
  const p = useStore(profile, s => s);
  const look = p.look;
  const set = (patch: Partial<Look>) => {
    profile.set(x => ({ look: { ...x.look, ...patch } }));
    audio.play('ui');
  };
  const need = (item: string) => {
    const u = UNLOCKS.find(x => x.item === item);
    if (!u) return '';
    if (u.need.best !== undefined) return t('locker.need.best', { n: u.need.best.toLocaleString() });
    if (u.need.kills !== undefined) return t('locker.need.kills', { n: u.need.kills });
    return '';
  };

  return (
    <div className="locker">
      <section className="locker__stage sheet sheet--grid enter" style={{ '--rot': '-0.8deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <div className="locker__preview">
          <Mascot look={look} size={200} />
        </div>
        <label className="field locker__name">
          <span>{t('locker.name')}</span>
          <input className="input" value={look.name} maxLength={16} onChange={e => profile.set(x => ({ look: { ...x.look, name: e.target.value.replace(/[<>]/g, '') || 'Doodle' } }))} />
        </label>
        <p className="tiny">{t('locker.lead')}</p>
      </section>

      <section className="locker__options sheet enter scroll" style={{ animationDelay: '60ms' }}>
        <h3>{t('locker.body')}</h3>
        <div className="locker__types">
          {botAvatarTypes.map((type: BotAvatarType, i: number) => (
            <button key={type} type="button" className="locker__type" aria-pressed={look.type === type} onClick={() => set({ type })} title={type}>
              <BotAvatar type={type} size={40} shading="crisp" paused interactive={false} seed={i / 18} theme="light" />
            </button>
          ))}
        </div>

        <h3>{t('locker.color')}</h3>
        <div className="swatches">
          {BODY_COLORS.map(c => (
            <button
              key={c || 'default'}
              type="button"
              className="swatch"
              aria-pressed={look.body === c}
              aria-label={c || t('locker.default')}
              style={{ background: c || botAvatarPalette[look.type] }}
              data-default={c ? undefined : ''}
              onClick={() => set({ body: c })}
            />
          ))}
        </div>

        <h3>{t('locker.hat')}</h3>
        <div className="opts">
          {HATS.map(h => {
            const item = `hat:${h}`;
            const open = h === 'none' || isUnlocked(item, p);
            return (
              <button key={h} type="button" className="chip" aria-pressed={look.hat === h} disabled={!open} title={open ? '' : need(item)} onClick={() => set({ hat: h })}>
                {h === 'none' ? t('locker.none') : h}
                {!open ? <span className="lock">🔒 {need(item)}</span> : null}
              </button>
            );
          })}
        </div>

        <h3>{t('locker.glasses')}</h3>
        <div className="opts">
          {GLASSES.map(g => {
            const item = `glasses:${g}`;
            const open = g === 'none' || isUnlocked(item, p);
            return (
              <button key={g} type="button" className="chip" aria-pressed={look.glasses === g} disabled={!open} onClick={() => set({ glasses: g })}>
                {g === 'none' ? t('locker.none') : g}
                {!open ? <span className="lock">🔒 {need(item)}</span> : null}
              </button>
            );
          })}
        </div>

        <h3>{t('locker.extras')}</h3>
        <div className="opts">
          {(['headphones', 'bowTie'] as const).map(k => {
            const open = isUnlocked(k, p);
            return (
              <label key={k} className="row-toggle" data-locked={open ? undefined : ''}>
                <button type="button" className="toggle" role="switch" aria-checked={look[k]} disabled={!open} onClick={() => set({ [k]: !look[k] })} />
                <span>{t(`locker.${k}`)}</span>
                {!open ? <span className="lock">🔒 {need(k)}</span> : null}
              </label>
            );
          })}
        </div>

        <h3>{t('locker.accent')}</h3>
        <div className="swatches">
          {ACCENTS.map(c => (
            <button key={c} type="button" className="swatch" aria-pressed={look.color === c} aria-label={c} style={{ background: c }} onClick={() => set({ color: c })} />
          ))}
        </div>
      </section>
    </div>
  );
}
