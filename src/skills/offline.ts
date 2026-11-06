import type { Slot } from './balance.ts';

/**
 * A rule-based forge for when no AI key is set (or the call fails).
 * It reads keywords in Thai and English and assembles a raw skill spec;
 * the result still goes through `balanceSkill` like an AI answer does.
 */
const RULES: { re: RegExp; make: (strong: boolean) => Record<string, unknown> }[] = [
  { re: /dash|blink|teleport|พุ่ง|วาร์ป|กระโดด|หลบ/i, make: s => ({ type: 'dash', distance: s ? 13 : 9 }) },
  { re: /heal|cure|patch|ฮีล|รักษา|เลือด|พยาบาล/i, make: s => ({ type: 'heal', amount: s ? 55 : 35 }) },
  { re: /shield|armor|guard|โล่|เกราะ|ป้องกัน/i, make: s => ({ type: 'shield', amount: s ? 70 : 40 }) },
  { re: /wall|barrier|cover|กำแพง|กำบัง|ฉาก/i, make: s => ({ type: 'wall', width: s ? 8 : 5, duration: s ? 9 : 6 }) },
  { re: /scan|reveal|radar|see|มองเห็น|สแกน|เรดาร์|ตา/i, make: s => ({ type: 'reveal', radius: s ? 60 : 35, duration: 4 }) },
  { re: /decoy|clone|fake|ตัวล่อ|โคลน|หลอก/i, make: s => ({ type: 'decoy', duration: s ? 8 : 5 }) },
  { re: /pull|magnet|vortex|black ?hole|ดูด|แม่เหล็ก|หลุมดำ/i, make: s => ({ type: 'pull', radius: s ? 10 : 6, strength: s ? 0.9 : 0.6 }) },
  { re: /slow|ink|glue|sticky|freeze|ice|ช้า|หมึก|กาว|หนืด|น้ำแข็ง/i, make: s => ({ type: 'area', radius: s ? 9 : 5, damage: 8, slow: 0.5, duration: s ? 6 : 4 }) },
  { re: /poison|storm|rain|zone|field|พิษ|พายุ|ฝน|โซน/i, make: s => ({ type: 'area', radius: s ? 10 : 6, damage: s ? 60 : 25, slow: 0, duration: s ? 5 : 3 }) },
  { re: /fast|speed|haste|rush|เร็ว|ความเร็ว|ซิ่ง/i, make: s => ({ type: 'buff', stat: 'speed', multiplier: s ? 1.6 : 1.3, duration: s ? 8 : 5 }) },
  { re: /rage|power|strong|damage|แรง|โกรธ|พลัง|ดาเมจ/i, make: s => ({ type: 'buff', stat: 'damage', multiplier: s ? 1.6 : 1.3, duration: s ? 8 : 5 }) },
  { re: /rapid|spray|fire rate|ยิงรัว|รัว/i, make: s => ({ type: 'buff', stat: 'fireRate', multiplier: s ? 1.6 : 1.35, duration: 6 }) },
  { re: /bomb|explo|grenade|rocket|missile|fire|ระเบิด|จรวด|ไฟ|มิสไซล์|ลูกไฟ/i, make: s => ({ type: 'projectile', damage: s ? 110 : 60, count: 1, radius: s ? 6 : 3.5, speed: 40 }) },
  { re: /shot|shoot|dart|arrow|bullet|plane|ยิง|ลูกดอก|ธนู|เครื่องบิน|กระสุน/i, make: s => ({ type: 'projectile', damage: s ? 70 : 35, count: s ? 5 : 3, radius: 0, speed: 65 }) }
];

const NAMES_EN = ['Scribble', 'Fold', 'Crease', 'Ink', 'Origami', 'Doodle', 'Margin', 'Staple'];
const NAMES_TH = ['ขีดเขียน', 'พับกระดาษ', 'หมึกซึม', 'โอริกามิ', 'ดูเดิล', 'รอยพับ'];

export function offlineSkill(prompt: string, slot: Slot, lang: 'th' | 'en') {
  const strong = slot === 'ultimate';
  const effects: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    if (effects.length >= 3) break;
    if (!r.re.test(prompt)) continue;
    const fx = r.make(strong);
    const key = `${fx.type}:${fx.stat ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    effects.push(fx);
  }
  if (!effects.length) effects.push({ type: 'projectile', damage: strong ? 90 : 45, count: 1, radius: strong ? 5 : 2.5, speed: 45 });

  const pick = <T,>(arr: T[]) => arr[Math.abs(hash(prompt)) % arr.length];
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const title = words.length && words[0].length <= 14 ? words.slice(0, 2).join(' ') : pick(lang === 'th' ? NAMES_TH : NAMES_EN);
  return {
    name: lang === 'th' ? `${title}` : `${title[0]?.toUpperCase() ?? ''}${title.slice(1)}`,
    description: prompt.slice(0, 140),
    effects
  };
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
