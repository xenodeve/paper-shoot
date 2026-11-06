import { BotAvatar } from 'bot-avatars';
import { useT } from '../../i18n';
import { profile } from '../../profile';
import { useStore } from '../../store';

export function BoardPanel() {
  const t = useT();
  const scores = useStore(profile, p => p.scores);
  return (
    <div className="board">
      <section className="sheet sheet--ruled board__sheet enter" style={{ '--rot': '0.5deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <span className="tape tape--tr" />
        <h2 className="display">{t('board.title')}</h2>
        {scores.length === 0 ? (
          <p className="muted">{t('board.empty')}</p>
        ) : (
          <ol className="board__list">
            {scores.map((s, i) => (
              <li key={`${s.at}-${i}`} data-rank={i + 1}>
                <span className="board__rank display">{i + 1}</span>
                <BotAvatar type={s.type} size={36} shading="crisp" paused interactive={false} theme="light" hat={i === 0 ? 'crown' : 'none'} accessoryColor="#e0a82e" />
                <span className="board__name">{s.name}</span>
                <span className="board__meta tiny">
                  {t('board.wave')} {s.wave} · {t('board.kills')} {s.kills} · {new Date(s.at).toLocaleDateString(t.lang === 'th' ? 'th-TH' : 'en-GB')}
                </span>
                <strong className="board__score display tnum">{s.score.toLocaleString()}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
