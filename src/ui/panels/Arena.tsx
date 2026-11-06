import { useRef } from 'react';
import { BotAvatar } from 'bot-avatars';
import FlyingButton from '../components/FlyingButton';
import { useT } from '../../i18n';
import { bestScore, profile, skillById } from '../../profile';
import { useStore } from '../../store';
import { ENEMIES } from '../../game/enemies';
import { SkillGlyph } from '../common';
import { audio } from '../../game/audio';

export function ArenaPanel({ onPlay, onChange }: { onPlay: () => void; onChange: () => void }) {
  const t = useT();
  const p = useStore(profile, s => s);
  const best = bestScore(p);
  const tac = skillById(p.loadout.tactical, 'tactical');
  const ult = skillById(p.loadout.ultimate, 'ultimate');
  const launching = useRef(false);

  const drop = () => {
    if (launching.current) return;
    launching.current = true;
    audio.unlock();
    audio.play('ult');
    // let the button actually take off before the match loads
    window.setTimeout(onPlay, 1100);
  };

  return (
    <div className="arena">
      <section className="sheet sheet--ruled arena__brief enter" style={{ '--rot': '-0.6deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <span className="tape tape--tr" />
        <h2 className="display arena__title">{t('menu.arena')}</h2>
        <p className="arena__lead">{t('arena.brief')}</p>

        <div className="arena__row">
          <div className="arena__best">
            <span className="tiny">{t('arena.best')}</span>
            <strong className="display tnum">{best.toLocaleString()}</strong>
          </div>
          <div className="arena__loadout">
            <span className="tiny">{t('arena.loadout')}</span>
            <div className="arena__skills">
              {[tac, ult].map(s => (
                <div key={s.id} className="mini-skill" style={{ '--skill': s.color } as React.CSSProperties}>
                  <span className="mini-skill__icon">
                    <SkillGlyph icon={s.icon} size={16} color="#fff" />
                  </span>
                  <span className="mini-skill__text">
                    <span className="kbd">{s.slot === 'tactical' ? 'Q' : 'Z'}</span> {s.name}
                  </span>
                </div>
              ))}
              <button type="button" className="btn btn--sm" onClick={onChange}>
                {t('arena.change')}
              </button>
            </div>
          </div>
        </div>

        <div className="roster">
          {Object.values(ENEMIES).map((e, i) => (
            <figure key={e.kind} className="roster__bot" style={{ '--rot': `${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg` } as React.CSSProperties}>
              <BotAvatar
                type={e.type}
                size={58}
                shading="crisp"
                hat={e.wear.hat}
                glasses={e.wear.glasses}
                headphones={e.wear.headphones}
                bowTie={e.wear.bowTie}
                accessoryColor={e.wear.color}
                seed={i / 6}
                theme="light"
              />
              <figcaption>{t(`enemy.${e.kind}`)}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="launch enter" style={{ animationDelay: '80ms' }}>
        <FlyingButton
          theme="light"
          size="extra-large"
          trigger="click"
          altitude={150}
          hoverTime={1}
          jets={2}
          buttonColor="#e5533d"
          textColor="#ffffff"
          thrustColor="#ffb347"
          smokeColor="#f6f0e1"
          radius={10}
          onClick={drop}
        >
          {t('drop')} ✈
        </FlyingButton>
        <p className="launch__hint tiny">{t('drop.hint')}</p>
      </section>
    </div>
  );
}
