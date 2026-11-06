import type { Command } from './game/Game';

/**
 * Voice: the Web Speech API (Chrome / Edge), in Thai or English.
 * Only a small, fixed vocabulary is understood in a match — fast to say,
 * hard to mishear. Order matters: more specific phrases come first.
 */
const PHRASES: [Command, RegExp][] = [
  ['ultimate', /ultimate|ulti|อัลติ|อัลติเมท|ท่าไม้ตาย|อัลท์/i],
  ['reload', /reload|re-load|รีโหลด|เติมกระสุน|โหลดกระสุน|เปลี่ยนแม็ก/i],
  ['heal', /heal|patch|ฮีล|รักษา|เติมเลือด|แปะเทป|ทากาว/i],
  ['switch', /switch|swap|next weapon|เปลี่ยนปืน|สลับปืน/i],
  ['ping', /ping|mark|enemy|มาร์ค|มาร์ก|ปักหมุด|ศัตรู/i],
  ['pause', /pause|stop|หยุด|พัก/i],
  ['tactical', /skill|ability|tactical|สกิล|ทักติคอล|ใช้ท่า/i],
  ['jump', /jump|กระโดด/i]
];

export function parseCommand(text: string): Command | null {
  const t = text.trim();
  if (!t) return null;
  for (const [cmd, re] of PHRASES) if (re.test(t)) return cmd;
  return null;
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function speechSupported() {
  return typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}

/**
 * One recognition session at a time. `onText` gets interim and final
 * transcripts; `onEnd` fires once when the session closes for any reason.
 */
export function listen(lang: 'th' | 'en', onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void) {
  const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) {
    onEnd('unsupported');
    return { stop() {} };
  }
  const rec = new Ctor();
  rec.lang = lang === 'th' ? 'th-TH' : 'en-US';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  let ended = false;
  const finish = (err?: string) => {
    if (ended) return;
    ended = true;
    onEnd(err);
  };
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      onText(r[0].transcript, r.isFinal);
    }
  };
  rec.onerror = e => finish(e.error);
  rec.onend = () => finish();
  try {
    rec.start();
  } catch {
    finish('start-failed');
  }
  return {
    stop() {
      try {
        rec.stop();
      } catch {
        finish();
      }
    }
  };
}
