import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import PulseHeart from '../components/PulseHeart';
import { useT } from '../../i18n';
import { BUILTIN, profile } from '../../profile';
import { useStore } from '../../store';
import { SkillCard } from '../common';
import type { Skill } from '../../skills/balance';
import { audio } from '../../game/audio';

export function LibraryPanel({ onForge }: { onForge: () => void }) {
  const t = useT();
  const p = useStore(profile, s => s);
  const [filter, setFilter] = useState<'all' | 'fav' | 'tactical' | 'ultimate'>('all');
  const all = [...BUILTIN, ...p.library];
  const list = all.filter(s => (filter === 'all' ? true : filter === 'fav' ? p.favorites.includes(s.id) : s.slot === filter));

  const equip = (s: Skill) => {
    profile.set(x => ({ loadout: { ...x.loadout, [s.slot]: s.id } }));
    audio.play('pickup');
  };
  const fav = (s: Skill, on: boolean) => profile.set(x => ({ favorites: on ? [...new Set([...x.favorites, s.id])] : x.favorites.filter(id => id !== s.id) }));
  const remove = (s: Skill) =>
    profile.set(x => ({
      library: x.library.filter(k => k.id !== s.id),
      favorites: x.favorites.filter(id => id !== s.id),
      loadout: x.loadout[s.slot] === s.id ? { ...x.loadout, [s.slot]: BUILTIN.find(b => b.slot === s.slot)!.id } : x.loadout
    }));

  return (
    <div className="library">
      <header className="panel-head enter">
        <h2 className="display">{t('lib.title')}</h2>
        <div className="seg">
          {(['all', 'fav', 'tactical', 'ultimate'] as const).map(f => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? t('lib.filter.all') : f === 'fav' ? t('lib.filter.fav') : t(`slot.${f}`)}
            </button>
          ))}
        </div>
      </header>
      {p.library.length === 0 ? (
        <div className="empty sheet enter">
          <p>{t('lib.empty')}</p>
          <button type="button" className="btn btn--primary" onClick={onForge}>
            {t('menu.forge')}
          </button>
        </div>
      ) : null}
      <div className="library__grid">
        {list.map((s, i) => {
          const equipped = p.loadout[s.slot] === s.id;
          return (
            <SkillCard
              key={s.id}
              skill={s}
              highlight={equipped}
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              actions={
                <>
                  <button type="button" className="btn btn--sm btn--marker" disabled={equipped} onClick={() => equip(s)}>
                    {equipped ? t('forge.equipped') : t('forge.equip')}
                  </button>
                  <PulseHeart
                    liked={p.favorites.includes(s.id)}
                    onChange={(on: boolean) => fav(s, on)}
                    showCount={false}
                    size={18}
                    pillColor="transparent"
                    idleColor="#8a90a3"
                    likedColor="#e5533d"
                    label={t('lib.fav')}
                  />
                  {s.source !== 'builtin' ? (
                    <button type="button" className="btn btn--sm btn--ghost" aria-label={t('lib.delete')} onClick={() => remove(s)}>
                      <HugeiconsIcon icon={Delete02Icon} size={16} />
                    </button>
                  ) : null}
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
