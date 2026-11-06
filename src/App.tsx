import { useEffect, useState } from 'react';
import { Menu } from './ui/Menu';
import { Play } from './ui/Play';
import { hud, initialHud } from './game/hud';
import { useT } from './i18n';
import { settings } from './profile';
import { useStore } from './store';
import './ui/app.css';

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'play'>('menu');
  const lang = useStore(settings, s => s.lang);
  const t = useT();
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (coarse) {
    return (
      <div className="overlay overlay--solid">
        <div className="desk" />
        <div className="sheet ready">
          <strong className="display">Paper Shoot</strong>
          <p>{t('desktop.only')}</p>
        </div>
      </div>
    );
  }

  return screen === 'menu' ? (
    <Menu
      onPlay={() => {
        hud.set({ ...initialHud });
        setScreen('play');
      }}
    />
  ) : (
    <Play
      onExit={() => {
        hud.set({ ...initialHud });
        setScreen('menu');
      }}
    />
  );
}
