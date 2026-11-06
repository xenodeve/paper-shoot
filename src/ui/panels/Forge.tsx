import { useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import VoicePill from '../components/VoicePill';
import LatticeLoader from '../components/LatticeLoader';
import ThoughtLine from '../components/ThoughtLine';
import { useT } from '../../i18n';
import { profile } from '../../profile';
import { useStore } from '../../store';
import { balanceSkill, POWER_CAP, type BalanceNote, type Skill, type Slot } from '../../skills/balance';
import { offlineSkill } from '../../skills/offline';
import { listen, speechSupported } from '../../voice';
import { SkillCard } from '../common';
import { audio } from '../../game/audio';
import type { ForgeResponse } from '../../server/forge';
import { fallbackKind } from '../../forgeReason';

type Status = 'idle' | 'working' | 'done' | 'error';

export function ForgePanel() {
  const t = useT();
  const loadout = useStore(profile, p => p.loadout);
  const [prompt, setPrompt] = useState('');
  const [slot, setSlot] = useState<Slot>('tactical');
  const [status, setStatus] = useState<Status>('idle');
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Extract<ForgeResponse, { ok: true }> | null>(null);
  const [health, setHealth] = useState<{ ai: boolean; model: string } | null>(null);
  const [interim, setInterim] = useState('');
  const rec = useRef<{ stop(): void } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/health')
      .then(r => r.json())
      .then(h => live && setHealth(h))
      .catch(() => live && setHealth({ ai: false, model: '' }));
    return () => {
      live = false;
    };
  }, []);

  const forge = async () => {
    const text = prompt.trim();
    if (text.length < 2 || status === 'working') return;
    audio.unlock();
    audio.play('skill');
    setStatus('working');
    setResult(null);
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 500);
    let res: ForgeResponse;
    try {
      const r = await fetch('/api/forge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: text, slot, lang: t.lang }) });
      res = (await r.json()) as ForgeResponse;
    } catch {
      // no server at all (static hosting): forge locally, same referee
      const b = balanceSkill(offlineSkill(text, slot, t.lang), slot, 'offline');
      res = b.ok ? { ok: true, skill: b.skill, power: b.power, cap: POWER_CAP[slot], notes: b.notes, via: 'offline', fallbackReason: 'other' } : { ok: false, error: b.error };
    }
    window.clearTimeout(t1);
    setStep(2);
    await new Promise(r => setTimeout(r, 450)); // let the referee step read
    if (!res.ok) {
      setStatus('error');
      return;
    }
    // re-referee on the client too: the browser trusts nothing it receives
    const again = balanceSkill(res.skill, slot, res.skill.source === 'offline' ? 'offline' : 'ai');
    if (!again.ok) {
      setStatus('error');
      return;
    }
    const skill = { ...again.skill, id: res.skill.id };
    profile.set(p => ({ library: [skill, ...p.library.filter(s => s.id !== skill.id)].slice(0, 40) }));
    setResult({ ...res, skill });
    setStatus('done');
    audio.play('crate');
  };

  const equip = (s: Skill) => {
    profile.set(p => ({ loadout: { ...p.loadout, [s.slot]: s.id } }));
    audio.play('pickup');
  };

  const startVoice = () => {
    setInterim('');
    rec.current = listen(
      t.lang,
      (text, final) => {
        if (final) {
          setPrompt(p => (p ? `${p} ${text}` : text).slice(0, 300));
          setInterim('');
        } else setInterim(text);
      },
      () => {
        rec.current = null;
        setInterim('');
      }
    );
  };
  const stopVoice = () => rec.current?.stop();

  const noteText = (n: BalanceNote) => {
    const field = n.field.replace(/^effects\[(\d+)\]\.?/, (_, i) => `#${Number(i) + 1} `).trim();
    return t(`note.${n.reason}`, { field, from: n.from ?? '', to: n.to ?? '' });
  };

  const working = status === 'working';
  const examples = ['forge.ex1', 'forge.ex2', 'forge.ex3', 'forge.ex4'];

  return (
    <div className="forge">
      <section className="sheet sheet--grid forge__desk enter" style={{ '--rot': '0.4deg' } as React.CSSProperties}>
        <span className="tape tape--tl" />
        <header className="forge__head">
          <div>
            <h2 className="display">{t('forge.title')}</h2>
            <p className="muted">{t('forge.lead')}</p>
          </div>
          <div className="forge__status" data-on={health?.ai ? '' : undefined}>
            <span className="dot" />
            {health === null ? t('forge.status.checking') : health.ai ? t('forge.status.ai', { model: health.model }) : t('forge.status.offline')}
          </div>
        </header>

        <div className="forge__slot">
          <span className="tiny">{t('forge.slot')}</span>
          <div className="seg">
            {(['tactical', 'ultimate'] as const).map(s => (
              <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                <span className="kbd">{s === 'tactical' ? 'Q' : 'Z'}</span> {t(`slot.${s}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="forge__input">
          <textarea
            className="input forge__text"
            rows={3}
            maxLength={300}
            value={prompt}
            placeholder={t('forge.placeholder')}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void forge();
            }}
            disabled={working}
          />
          {interim ? <div className="forge__interim">“{interim}”</div> : null}
          <div className="forge__tools">
            {speechSupported() ? (
              <span className="forge__mic" title={t('forge.voice')}>
                <VoicePill
                  size={36}
                  reactive="mic"
                  mode="auto"
                  accentColor="#1f2a44"
                  iconColor="#1f2a44"
                  background="#ffd84a"
                  ariaLabel={t('forge.voice')}
                  onStart={startVoice}
                  onStop={stopVoice}
                  slideToCancel={false}
                  disabled={working}
                />
              </span>
            ) : null}
            <span className="tiny tnum">{prompt.length}/300</span>
            <button type="button" className="btn btn--primary" onClick={forge} disabled={working || prompt.trim().length < 2}>
              {t('forge.go')}
            </button>
          </div>
        </div>

        <div className="forge__examples">
          <span className="tiny">{t('forge.examples')}</span>
          {examples.map(k => (
            <button key={k} type="button" className="chip" onClick={() => setPrompt(t(k))} disabled={working}>
              {t(k)}
            </button>
          ))}
        </div>
      </section>

      <section className="forge__out">
        {status === 'idle' ? (
          <div className="forge__empty enter">
            <ThinkingOrb state="breathing" size={64} theme="light" color="#1f2a44" />
          </div>
        ) : (
          <div className="forge__progress sheet enter">
            <div className="forge__orb">
              <ThinkingOrb state={working ? (step < 1 ? 'searching' : step < 2 ? 'shaping' : 'solving') : status === 'done' ? 'breathing' : 'connecting'} size={64} theme="light" color={result?.skill.color ?? '#1f2a44'} paused={!working} />
            </div>
            <div className="forge__lines">
              <ThoughtLine
                working={working}
                steps={[t('forge.step.read'), t('forge.step.draft'), t('forge.step.referee')]}
                current={step}
                label={`${t('forge.thinking')}…`}
                doneLabel={t('forge.done')}
                fontSize={15}
                collapseOnSettle
              />
              <LatticeLoader status={working ? 'working' : status === 'done' ? 'done' : 'error'} label={t('forge.thinking')} doneLabel={t('forge.done')} errorLabel={t('forge.failed')} pattern="orbit" grid={3} doneColor="#2f9e5b" errorColor="#e5533d" color="#1f2a44" fontSize={13} />
            </div>
          </div>
        )}

        {result && status === 'done' ? (
          <div className="forge__result enter">
            <SkillCard
              skill={result.skill}
              highlight
              actions={
                <>
                  <button type="button" className="btn btn--marker" onClick={() => equip(result.skill)} disabled={loadout[result.skill.slot] === result.skill.id}>
                    {loadout[result.skill.slot] === result.skill.id ? t('forge.equipped') : t('forge.equip')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setStatus('idle');
                      setResult(null);
                      setPrompt('');
                    }}
                  >
                    {t('forge.again')}
                  </button>
                  <span className="tiny">{t('forge.save')}</span>
                </>
              }
            />
            <aside className="referee sheet">
              <strong>{t('forge.notes')}</strong>
              {result.notes.length ? (
                <ul>
                  {result.notes.slice(0, 8).map((n, i) => (
                    <li key={i}>{noteText(n)}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{t('forge.noNotes')}</p>
              )}
              <p className="tiny">
                {result.via === 'ai' ? t('forge.via.ai', { model: result.model ?? 'AI' }) : t('forge.via.offline')}
                {result.via === 'offline' && result.fallbackReason ? ` — ${t(`forge.offlineWhy.${fallbackKind(result.fallbackReason)}`)}` : ''}
              </p>
              {result.skill.program ? (
                <div className="panel-votes">
                  <strong>{t('forge.panel.title', { n: result.skill.program.votes.filter(v => v.vote === 'pass').length })}</strong>
                  <ul>
                    {result.skill.program.votes.map(v => (
                      <li key={v.model} className={v.vote === 'pass' ? 'is-pass' : 'is-reject'}>
                        <span aria-hidden>{v.vote === 'pass' ? '✓' : '✗'}</span> <code>{v.model}</code>
                        {v.reason ? <span className="muted"> — {v.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <details>
                    <summary className="tiny">{t('forge.panel.script')}</summary>
                    <pre className="panel-votes__code">{result.skill.program.source}</pre>
                  </details>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </section>
    </div>
  );
}
