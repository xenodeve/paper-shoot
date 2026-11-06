import { useEffect, useRef, useState } from 'react';
import { Backdrop } from '../game/Backdrop';
import {
  AiMagicIcon,
  Award01Icon,
  Books01Icon,
  Image01Icon,
  KeyboardIcon,
  Target02Icon,
  TShirtIcon,
  VolumeHighIcon
} from '@hugeicons/core-free-icons';
import BranchedMenu from './components/BranchedMenu';
import { useT } from '../i18n';
import { profile, settings } from '../profile';
import { useStore } from '../store';
import { audio } from '../game/audio';
import { Mascot } from './common';
import { ArenaPanel } from './panels/Arena';
import { ForgePanel } from './panels/Forge';
import { LibraryPanel } from './panels/Library';
import { LockerPanel } from './panels/Locker';
import { BoardPanel } from './panels/Board';
import { SettingsPanel } from './panels/Settings';

/** The live arena behind the menu, blurred (#10). One Backdrop per mount; gone before the match starts. */
function MenuBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = new Backdrop(ref.current!, { lineBoil: settings.get().lineBoil }); // creates and later removes its own canvas
    if (import.meta.env.DEV) (window as unknown as { __backdrop?: Backdrop }).__backdrop = b;
    return () => b.dispose();
  }, []);
  return (
    <div ref={ref} className="menu__backdrop" aria-hidden="true">
      <div className="menu__veil" />
    </div>
  );
}

export type Panel = 'arena' | 'forge' | 'library' | 'locker' | 'board' | 'graphics' | 'audio' | 'controls';

export function Menu({ onPlay, initial = 'arena' }: { onPlay: () => void; initial?: Panel }) {
  const t = useT();
  const [panel, setPanel] = useState<Panel>(initial);
  // bumping this remounts the nav so its marker follows navigation that did not come from the nav itself
  const [navKey, setNavKey] = useState(0);
  const look = useStore(profile, p => p.look);
  const lang = useStore(settings, s => s.lang);

  const items = [
    { label: t('menu.play'), children: [{ value: 'arena', label: t('menu.arena'), icon: Target02Icon }] },
    {
      label: t('menu.skills'),
      children: [
        { value: 'forge', label: t('menu.forge'), icon: AiMagicIcon },
        { value: 'library', label: t('menu.library'), icon: Books01Icon }
      ]
    },
    {
      label: t('menu.you'),
      children: [
        { value: 'locker', label: t('menu.locker'), icon: TShirtIcon },
        { value: 'board', label: t('menu.board'), icon: Award01Icon }
      ]
    },
    {
      label: t('menu.settings'),
      children: [
        { value: 'graphics', label: t('menu.graphics'), icon: Image01Icon },
        { value: 'audio', label: t('menu.audio'), icon: VolumeHighIcon },
        { value: 'controls', label: t('menu.controls'), icon: KeyboardIcon }
      ]
    }
  ];

  const go = (v: string, external = false) => {
    audio.unlock();
    audio.play('ui');
    setPanel(v as Panel);
    if (external) setNavKey(k => k + 1);
  };

  return (
    <div className="menu">
      <MenuBackdrop />
      <aside className="menu__side">
        <div className="brand" style={{ '--rot': '-2deg' } as React.CSSProperties}>
          <h1 className="brand__title display">
            Paper<span>Shoot</span>
          </h1>
          <p className="brand__tag">{t('app.tagline')}</p>
        </div>
        <BranchedMenu
          key={`${lang}:${navKey}`}
          items={items}
          defaultOpen={[0, 1, 2, 3]}
          defaultActive={panel}
          onSelect={(v: string) => go(v)}
          color="#1f2a44"
          accentColor="#e5533d"
          lineColor="rgba(31,42,68,0.28)"
          fontSize={15}
          rowHeight={34}
          width={230}
        />
        <div className="menu__me">
          <Mascot look={look} size={56} />
          <div>
            <strong className="display">{look.name}</strong>
            <div className="tiny">{t('menu.locker')} →</div>
          </div>
          <button type="button" className="menu__me-hit" aria-label={t('menu.locker')} onClick={() => go('locker', true)} />
        </div>
        <div className="menu__lang seg" role="group" aria-label={t('set.lang')}>
          {(['th', 'en'] as const).map(l => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => settings.set({ lang: l })}>
              {l === 'th' ? 'ไทย' : 'EN'}
            </button>
          ))}
        </div>
      </aside>
      <main className="menu__main" key={panel}>
        {panel === 'arena' && <ArenaPanel onPlay={onPlay} onChange={() => go('library', true)} />}
        {panel === 'forge' && <ForgePanel />}
        {panel === 'library' && <LibraryPanel onForge={() => go('forge', true)} />}
        {panel === 'locker' && <LockerPanel />}
        {panel === 'board' && <BoardPanel />}
        {(panel === 'graphics' || panel === 'audio' || panel === 'controls') && <SettingsPanel section={panel} />}
      </main>
    </div>
  );
}
