/**
 * Every sound is synthesised from one shared noise buffer and a few
 * oscillators — paper crinkles, stapler clacks, pencil ticks. Nothing to
 * download. Voices are short-lived nodes; a cap stops pile-ups in big fights.
 */
type Sfx =
  | 'pistol'
  | 'smg'
  | 'shotgun'
  | 'rifle'
  | 'reload'
  | 'empty'
  | 'hit'
  | 'eyeshot'
  | 'kill'
  | 'enemyShot'
  | 'hurt'
  | 'shieldBreak'
  | 'pickup'
  | 'crate'
  | 'skill'
  | 'ult'
  | 'jump'
  | 'land'
  | 'step'
  | 'ui'
  | 'wave'
  | 'ring'
  | 'ping'
  | 'heal'
  | 'boom';

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private live = 0;
  volume = 0.7;

  private ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  unlock() {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private burst(t: number, opts: { type: BiquadFilterType; f: number; f2?: number; q?: number; peak: number; a?: number; d: number; rate?: number; pan?: number }) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = opts.rate ?? 1;
    src.loopStart = Math.random() * 0.5;
    const flt = c.createBiquadFilter();
    flt.type = opts.type;
    flt.frequency.setValueAtTime(opts.f, t);
    if (opts.f2) flt.frequency.exponentialRampToValueAtTime(opts.f2, t + (opts.a ?? 0.003) + opts.d);
    flt.Q.value = opts.q ?? 1;
    const g = c.createGain();
    this.env(g, t, opts.a ?? 0.003, opts.peak, opts.d);
    let node: AudioNode = src.connect(flt).connect(g);
    if (opts.pan) {
      const p = c.createStereoPanner();
      p.pan.value = opts.pan;
      node = node.connect(p);
    }
    node.connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + (opts.a ?? 0.003) + opts.d + 0.05);
    this.track(src);
  }

  private tone(t: number, opts: { type: OscillatorType; f: number; f2?: number; peak: number; a?: number; d: number; pan?: number }) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = opts.type;
    o.frequency.setValueAtTime(opts.f, t);
    if (opts.f2) o.frequency.exponentialRampToValueAtTime(opts.f2, t + (opts.a ?? 0.005) + opts.d);
    const g = c.createGain();
    this.env(g, t, opts.a ?? 0.005, opts.peak, opts.d);
    let node: AudioNode = o.connect(g);
    if (opts.pan) {
      const p = c.createStereoPanner();
      p.pan.value = opts.pan;
      node = node.connect(p);
    }
    node.connect(this.master!);
    o.start(t);
    o.stop(t + (opts.a ?? 0.005) + opts.d + 0.05);
    this.track(o);
  }

  private track(n: AudioScheduledSourceNode) {
    this.live++;
    n.onended = () => this.live--;
  }

  /** `pan` -1..1 and `dist` 0..1 (0 = at the listener) for positional cues. */
  play(name: Sfx, pan = 0, dist = 0) {
    const c = this.ensure();
    if (!c || !this.master || this.volume <= 0) return;
    if (this.live > 48 && name !== 'kill' && name !== 'eyeshot') return;
    const t = c.currentTime + 0.001;
    const near = 1 - Math.min(1, dist) * 0.85;
    const j = 0.94 + Math.random() * 0.12;
    switch (name) {
      case 'pistol':
        this.burst(t, { type: 'bandpass', f: 2400 * j, f2: 700, q: 0.8, peak: 0.55, d: 0.09 });
        this.tone(t, { type: 'triangle', f: 220 * j, f2: 70, peak: 0.35, d: 0.08 });
        break;
      case 'smg':
        this.burst(t, { type: 'bandpass', f: 3200 * j, f2: 1200, q: 1.2, peak: 0.38, d: 0.05 });
        this.tone(t, { type: 'square', f: 160 * j, f2: 90, peak: 0.12, d: 0.04 });
        break;
      case 'shotgun':
        this.burst(t, { type: 'lowpass', f: 1800, f2: 200, peak: 0.85, d: 0.26 });
        this.tone(t, { type: 'sine', f: 110, f2: 40, peak: 0.6, d: 0.22 });
        break;
      case 'rifle':
        this.burst(t, { type: 'highpass', f: 1500, peak: 0.6, d: 0.05 });
        this.burst(t + 0.02, { type: 'lowpass', f: 900, f2: 120, peak: 0.45, d: 0.35 });
        this.tone(t, { type: 'sawtooth', f: 300, f2: 60, peak: 0.18, d: 0.12 });
        break;
      case 'reload':
        this.burst(t, { type: 'bandpass', f: 1800, q: 4, peak: 0.25, d: 0.04 });
        this.burst(t + 0.16, { type: 'bandpass', f: 2600, q: 5, peak: 0.3, d: 0.05 });
        break;
      case 'empty':
        this.burst(t, { type: 'highpass', f: 3000, peak: 0.18, d: 0.025 });
        break;
      case 'hit':
        this.burst(t, { type: 'bandpass', f: 900 * j, q: 2, peak: 0.35, d: 0.06 });
        this.tone(t, { type: 'sine', f: 700 * j, f2: 500, peak: 0.12, d: 0.05 });
        break;
      case 'eyeshot':
        this.tone(t, { type: 'triangle', f: 1600, f2: 1300, peak: 0.32, d: 0.18 });
        this.tone(t + 0.02, { type: 'sine', f: 2400, peak: 0.16, d: 0.14 });
        break;
      case 'kill':
        // a sheet crumpling: a run of short noisy crackles
        for (let i = 0; i < 7; i++) this.burst(t + i * 0.025 + Math.random() * 0.01, { type: 'bandpass', f: 1200 + Math.random() * 2400, q: 1.5, peak: 0.3, d: 0.035 });
        this.tone(t, { type: 'triangle', f: 520, f2: 880, peak: 0.16, d: 0.12 });
        break;
      case 'enemyShot':
        this.burst(t, { type: 'bandpass', f: 1500, f2: 3800, q: 2, peak: 0.28 * near, a: 0.02, d: 0.12, pan });
        break;
      case 'hurt':
        this.burst(t, { type: 'lowpass', f: 700, f2: 200, peak: 0.6, d: 0.16, pan });
        this.tone(t, { type: 'square', f: 140, f2: 90, peak: 0.12, d: 0.1 });
        break;
      case 'shieldBreak':
        for (let i = 0; i < 5; i++) this.burst(t + i * 0.03, { type: 'highpass', f: 2500 + i * 600, peak: 0.3, d: 0.06 });
        this.tone(t, { type: 'triangle', f: 900, f2: 300, peak: 0.25, d: 0.3 });
        break;
      case 'pickup':
        this.tone(t, { type: 'triangle', f: 660, peak: 0.18, d: 0.06 });
        this.tone(t + 0.06, { type: 'triangle', f: 990, peak: 0.18, d: 0.08 });
        break;
      case 'crate':
        this.burst(t, { type: 'lowpass', f: 900, peak: 0.5, d: 0.12 });
        for (let i = 0; i < 4; i++) this.tone(t + 0.05 + i * 0.05, { type: 'triangle', f: 520 * Math.pow(1.26, i), peak: 0.14, d: 0.09 });
        break;
      case 'skill':
        this.burst(t, { type: 'bandpass', f: 600, f2: 3000, q: 1.2, peak: 0.4, a: 0.03, d: 0.25 });
        this.tone(t, { type: 'sine', f: 330, f2: 880, peak: 0.22, a: 0.02, d: 0.25 });
        break;
      case 'ult':
        this.burst(t, { type: 'lowpass', f: 300, f2: 4000, peak: 0.55, a: 0.12, d: 0.6 });
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.09, { type: 'triangle', f: 392 * Math.pow(1.335, i), peak: 0.22, d: 0.4 });
        break;
      case 'jump':
        this.burst(t, { type: 'bandpass', f: 900, f2: 1800, peak: 0.12, d: 0.08 });
        break;
      case 'land':
        this.burst(t, { type: 'lowpass', f: 500, peak: 0.25, d: 0.08 });
        break;
      case 'step':
        this.burst(t, { type: 'bandpass', f: 700 + Math.random() * 500, q: 1.5, peak: 0.07, d: 0.05 });
        break;
      case 'ui':
        this.tone(t, { type: 'triangle', f: 880, peak: 0.12, d: 0.05 });
        break;
      case 'wave':
        [392, 494, 587, 784].forEach((f, i) => this.tone(t + i * 0.09, { type: 'triangle', f, peak: 0.2, d: 0.25 }));
        break;
      case 'ring':
        this.tone(t, { type: 'sawtooth', f: 80, f2: 60, peak: 0.12, a: 0.2, d: 0.8 });
        this.burst(t, { type: 'bandpass', f: 400, q: 0.7, peak: 0.12, a: 0.2, d: 0.8 });
        break;
      case 'ping':
        this.tone(t, { type: 'sine', f: 1320, peak: 0.18, d: 0.12 });
        this.tone(t + 0.1, { type: 'sine', f: 1760, peak: 0.14, d: 0.16 });
        break;
      case 'heal':
        this.tone(t, { type: 'sine', f: 520, f2: 780, peak: 0.16, a: 0.05, d: 0.3 });
        break;
      case 'boom':
        this.burst(t, { type: 'lowpass', f: 1200, f2: 80, peak: 0.9 * near, d: 0.5, pan });
        this.tone(t, { type: 'sine', f: 90, f2: 30, peak: 0.7 * near, d: 0.4 });
        break;
    }
  }
}

export const audio = new Audio();
export type { Sfx };
