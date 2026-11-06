import { HugeiconsIcon } from '@hugeicons/react';
import {
  BrickWallIcon,
  FastWindIcon,
  FavouriteIcon,
  FireIcon,
  FlashIcon,
  GhostIcon,
  MagnetIcon,
  Shield01Icon,
  SparklesIcon,
  StarIcon,
  Target02Icon,
  ViewIcon
} from '@hugeicons/core-free-icons';
import { BotAvatar } from 'bot-avatars';
import type { CSSProperties, ReactNode } from 'react';
import type { Effect, Skill, SkillIcon } from '../skills/balance';
import { POWER_CAP, skillPower } from '../skills/balance';
import type { Look } from '../profile';
import { useT } from '../i18n';

const ICON: Record<SkillIcon, typeof FlashIcon> = {
  bolt: FlashIcon,
  flame: FireIcon,
  shield: Shield01Icon,
  heart: FavouriteIcon,
  wind: FastWindIcon,
  eye: ViewIcon,
  star: StarIcon,
  magnet: MagnetIcon,
  wall: BrickWallIcon,
  ghost: GhostIcon,
  target: Target02Icon,
  spark: SparklesIcon
};

export function SkillGlyph({ icon, size = 20, color }: { icon: SkillIcon; size?: number; color?: string }) {
  return <HugeiconsIcon icon={ICON[icon] ?? FlashIcon} size={size} strokeWidth={1.9} color={color} />;
}

type T = ReturnType<typeof useT>;

export function describeEffect(fx: Effect, t: T): string {
  const r = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(2)));
  switch (fx.type) {
    case 'dash':
      return t('fx.dash', { distance: r(fx.distance) });
    case 'heal':
      return t('fx.heal', { amount: r(fx.amount) });
    case 'shield':
      return t('fx.shield', { amount: r(fx.amount) });
    case 'projectile':
      return t('fx.projectile', { count: fx.count, damage: r(fx.damage), blast: fx.radius > 0.4 ? t('fx.projectile.blast', { radius: r(fx.radius) }) : '' });
    case 'area':
      return t('fx.area', { radius: r(fx.radius), damage: r(fx.damage), duration: r(fx.duration), slow: fx.slow > 0 ? t('fx.area.slow', { slow: Math.round(fx.slow * 100) }) : '' });
    case 'buff':
      return t('fx.buff', { stat: t(`stat.${fx.stat}`), multiplier: r(fx.multiplier), duration: r(fx.duration) });
    case 'decoy':
      return t('fx.decoy', { duration: r(fx.duration) });
    case 'wall':
      return t('fx.wall', { width: r(fx.width), duration: r(fx.duration) });
    case 'reveal':
      return t('fx.reveal', { radius: r(fx.radius), duration: r(fx.duration) });
    case 'pull':
      return t('fx.pull', { radius: r(fx.radius) });
  }
}

export function PowerBar({ skill }: { skill: Skill }) {
  const t = useT();
  const p = skillPower(skill);
  const cap = POWER_CAP[skill.slot];
  return (
    <div className="power" title={`${p.toFixed(1)} / ${cap}`}>
      <span className="tiny">{t('forge.power')}</span>
      <span className="power__track">
        <span className="power__fill" style={{ width: `${Math.min(100, (p / cap) * 100)}%`, background: skill.color }} />
      </span>
      <span className="tiny tnum">
        {Math.round(p)}/{cap}
      </span>
    </div>
  );
}

export function SkillCard({ skill, actions, highlight, style }: { skill: Skill; actions?: ReactNode; highlight?: boolean; style?: CSSProperties }) {
  const t = useT();
  return (
    <article className="skill-card sheet" data-highlight={highlight ? '' : undefined} style={{ '--skill': skill.color, ...style } as CSSProperties}>
      <header className="skill-card__head">
        <span className="skill-card__icon">
          <SkillGlyph icon={skill.icon} size={22} color="#fff" />
        </span>
        <div className="skill-card__title">
          <strong className="display">{skill.name}</strong>
          <span className="tiny">
            {t(`slot.${skill.slot}`)} · {t('forge.cooldown')} {skill.cooldown}s · {t(`lib.${skill.source}`)}
          </span>
        </div>
      </header>
      {skill.description ? <p className="skill-card__desc">{skill.description}</p> : null}
      {skill.program ? <p className="tiny muted">{t('skill.strongestCase')}</p> : null}
      <ul className="skill-card__fx">
        {skill.effects.map((fx, i) => (
          <li key={i}>{describeEffect(fx, t)}</li>
        ))}
      </ul>
      <PowerBar skill={skill} />
      {actions ? <footer className="skill-card__actions">{actions}</footer> : null}
    </article>
  );
}

export function Mascot({ look, size = 64, state = 'default', interactive = true, paused, shading = 'fabric' }: { look: Look; size?: number; state?: 'default' | 'working' | 'sleeping'; interactive?: boolean; paused?: boolean; shading?: 'fabric' | 'crisp' | 'plastic' }) {
  return (
    <BotAvatar
      type={look.type}
      color={look.body || undefined}
      size={size}
      state={state}
      hat={look.hat}
      glasses={look.glasses}
      headphones={look.headphones}
      bowTie={look.bowTie}
      accessoryColor={look.color}
      shading={shading}
      interactive={interactive}
      paused={paused}
      theme="light"
    />
  );
}
