import * as THREE from 'three';
import { disposeEnemy, EnemyBank, ENEMIES, makeEnemy, type Enemy } from './enemies';
import { orbitPose } from './orbit';
import { buildWorld, paperAtmosphere, type World } from './world';

/**
 * The live arena behind the main menu (issue #10). Same world as a match, a few
 * idle bots, and a slow orbiting camera — nothing else: no input, no physics,
 * no HUD. Cheap by construction:
 *  - rendered at RES of the screen; the browser's upscale is most of the blur
 *  - at most FPS frames a second, none while the tab is hidden
 *  - one still frame under prefers-reduced-motion
 *  - fully disposed (context included) before the match creates its own renderer
 */
const RES = 0.4;
const FPS = 30;

export class Backdrop {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.5, 260);
  private world: World;
  private bank = new EnemyBank();
  private bots: Enemy[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private ro: ResizeObserver;
  private canvas: HTMLCanvasElement;
  private disposed = false;
  /** CPU ms of the last rendered frame — read by the play-test, never shown. */
  lastFrameMs = 0;
  /** reused every frame: the orbit writes into it instead of allocating */
  private pose = orbitPose(0);

  /**
   * The backdrop owns its canvas: it creates one inside `host` and removes it on
   * dispose. dispose() forces a context loss, so a canvas must never be reused by
   * the next Backdrop (React StrictMode mounts twice in dev and did exactly that).
   */
  constructor(host: HTMLElement, opts: { lineBoil: boolean } = { lineBoil: true }) {
    const canvas = document.createElement('canvas');
    host.prepend(canvas);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(RES);
    paperAtmosphere(this.scene);
    this.world = buildWorld(this.scene);
    // honour the player's "hand-drawn line wobble" setting, as the match does
    this.world.materials.ink.uniforms.uBoil.value = opts.lineBoil ? 1 : 0;

    // a few bots loitering around the tower, facing out
    const kinds = Object.values(ENEMIES);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const d = 13 + (i % 3) * 5;
      const e = makeEnemy(this.bank, kinds[i % kinds.length], i === 3, new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), 1);
      e.yaw = a + Math.PI / 2;
      e.card.rotation.y = e.yaw;
      this.scene.add(e.root);
      this.bots.push(e);
    }

    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas);
    this.resize();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.draw(8);
    else this.raf = requestAnimationFrame(this.frame);
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (document.hidden) return;
    this.acc += dt;
    if (this.acc < 1 / FPS) return;
    this.t += this.acc;
    this.acc = 0;
    this.draw(this.t);
  };

  private draw(t: number) {
    const a = performance.now();
    const p = orbitPose(t, this.pose);
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.lookAt(p.lookX, p.lookY, p.lookZ);
    this.world.update(t);
    for (let i = 0; i < this.bots.length; i++) {
      // idle sway: a cardboard cut-out shuffling on its stand
      const e = this.bots[i];
      e.card.rotation.y = e.yaw + Math.sin(t * 0.6 + i) * 0.5;
      e.card.rotation.z = Math.sin(t * 2.2 + i * 1.7) * 0.05;
      e.card.position.y = Math.abs(Math.sin(t * 2.2 + i * 1.7)) * 0.08;
    }
    this.renderer.render(this.scene, this.camera);
    this.lastFrameMs = performance.now() - a;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.bots.forEach(disposeEnemy);
    this.bank.dispose();
    this.world.dispose();
    this.renderer.dispose();
    // hand the GPU context back before the match asks for its own
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
