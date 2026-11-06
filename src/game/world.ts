import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './collision';
import { INK, kraft, notebookGround, paperGrain, rng, toonRamp } from './textures';

import { ARENA_R } from './arena';

export { ARENA_R };

/** The page's light and air: paper background, fog, a warm sky and one sun. Shared by the match and the menu backdrop. */
export function paperAtmosphere(scene: THREE.Scene) {
  const paper = new THREE.Color('#efe6d2');
  scene.background = paper;
  scene.fog = new THREE.Fog(paper, 70, 215);
  scene.add(new THREE.HemisphereLight('#fff8ea', '#cdb991', 1.25));
  const sun = new THREE.DirectionalLight('#fffaf0', 1.7);
  sun.position.set(40, 80, 25);
  scene.add(sun);
}

/**
 * The Desk — a notebook page with stationery for terrain.
 * Every static prop is folded into ONE faceted mesh (vertex colours, one
 * toon material) plus ONE line mesh for the ink outlines, so the whole map
 * costs a handful of draw calls however many props it holds.
 */
export interface World {
  group: THREE.Group;
  collision: CollisionWorld;
  crateSpots: THREE.Vector3[];
  spawnPoint: THREE.Vector3;
  materials: { toon: THREE.MeshToonMaterial; ink: THREE.ShaderMaterial; boxToon: THREE.MeshToonMaterial };
  ramp: THREE.DataTexture;
  update(time: number): void;
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

class Builder {
  geos: THREE.BufferGeometry[] = [];
  edges: number[] = [];
  edgeAngle = 28;

  add(geo: THREE.BufferGeometry, color: string | THREE.Color, pos: THREE.Vector3Like, rot: THREE.Vector3Like = { x: 0, y: 0, z: 0 }, scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 }, outline = true) {
    _m.compose(_p.set(pos.x, pos.y, pos.z), _q.setFromEuler(_e.set(rot.x, rot.y, rot.z)), _s.set(scale.x, scale.y, scale.z));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    g.deleteAttribute('normal');
    g.computeVertexNormals(); // non-indexed → face normals: every prop reads as folded paper
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // tiny per-face value jitter: no two folds catch the light the same
      const j = 0.96 + ((i / 3) | 0) % 5 * 0.012;
      col[i * 3] = c.r * j;
      col[i * 3 + 1] = c.g * j;
      col[i * 3 + 2] = c.b * j;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    this.geos.push(g);
    if (outline) {
      const e = new THREE.EdgesGeometry(geo, this.edgeAngle);
      e.applyMatrix4(_m);
      const arr = e.getAttribute('position').array as Float32Array;
      for (let i = 0; i < arr.length; i++) this.edges.push(arr[i]);
      e.dispose();
    }
  }
}

export function buildWorld(scene: THREE.Scene, seed = 1337): World {
  const r = rng(seed);
  const collision = new CollisionWorld();
  const group = new THREE.Group();
  const ramp = toonRamp();
  const grainTex = paperGrain();
  grainTex.repeat.set(0.5, 0.5);
  const toon = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ramp, map: grainTex });
  const b = new Builder();
  const fogColor = (scene.fog as THREE.Fog).color;

  // ---- shared template geometry ----
  const box = new THREE.BoxGeometry(1, 1, 1);
  const hex = new THREE.CylinderGeometry(1, 1, 1, 6);
  const cone6 = new THREE.ConeGeometry(1, 1, 6);
  const cone5 = new THREE.ConeGeometry(1, 1, 5);
  const cup = new THREE.CylinderGeometry(1.4, 1.05, 3, 10);
  const disc = new THREE.CylinderGeometry(1, 1, 1, 12);
  const ico = new THREE.IcosahedronGeometry(1, 1);
  // crumple the ball once, deterministically
  {
    const p = ico.getAttribute('position') as THREE.BufferAttribute;
    const seen = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let k = seen.get(key);
      if (k === undefined) {
        k = 0.78 + r() * 0.36;
        seen.set(key, k);
      }
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
  }

  const occupied: { x: number; z: number; r: number }[] = [{ x: 0, z: 46, r: 7 }];
  const free = (x: number, z: number, rad: number) =>
    Math.hypot(x, z) < ARENA_R - rad - 2 && occupied.every(o => Math.hypot(o.x - x, o.z - z) > o.r + rad + 1.2);
  const claim = (x: number, z: number, rad: number) => occupied.push({ x, z, r: rad });
  const place = (rad: number, cx: number, cz: number, spread: number, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * spread;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (free(x, z, rad)) {
        claim(x, z, rad);
        return { x, z };
      }
    }
    return null;
  };

  const boxProp = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, collide = true) => {
    b.add(box, color, { x, y: y + h / 2, z }, undefined, { x: w, y: h, z: d });
    if (collide) collision.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  };

  // ---- Book Tower: the centre, three hardcovers you can climb ----
  const book = (x: number, y: number, z: number, w: number, h: number, d: number, cover: string, spineSide: 1 | -1) => {
    const t = 0.2;
    b.add(box, '#fbf8ef', { x: x - spineSide * 0.1, y: y + h / 2, z }, undefined, { x: w - 0.5, y: h - t * 2, z: d - 0.3 });
    b.add(box, cover, { x, y: y + t / 2, z }, undefined, { x: w, y: t, z: d });
    b.add(box, cover, { x, y: y + h - t / 2, z }, undefined, { x: w, y: t, z: d });
    b.add(box, cover, { x: x + spineSide * (w / 2 - 0.15), y: y + h / 2, z }, undefined, { x: 0.3, y: h, z: d });
    collision.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  };
  book(0, 0, 0, 18, 1.3, 13, '#d4543f', 1);
  book(-1.2, 1.3, 0.5, 13, 1.25, 9.5, '#3b6fb6', -1);
  book(0.8, 2.55, -0.4, 8.5, 1.2, 6.5, '#e0a82e', 1);
  // a pencil leaning into the tower as a landmark
  claim(0, 0, 11.5);

  // ---- Pencil Grove (north-east) ----
  const pencilColors = ['#f2c230', '#e5533d', '#3b82c4', '#2f9e5b', '#8a5cc8'];
  for (let i = 0; i < 16; i++) {
    const p = place(1.1, 48, -48, 22);
    if (!p) continue;
    const h = 7 + r() * 10;
    const col = pencilColors[(r() * pencilColors.length) | 0];
    b.add(disc, '#f29bb0', { x: p.x, y: 0.6, z: p.z }, undefined, { x: 0.82, y: 1.2, z: 0.82 });
    b.add(disc, '#b9bfc8', { x: p.x, y: 1.55, z: p.z }, undefined, { x: 0.86, y: 0.7, z: 0.86 });
    b.add(hex, col, { x: p.x, y: 1.9 + h / 2, z: p.z }, { x: 0, y: r() * 3, z: 0 }, { x: 0.85, y: h, z: 0.85 });
    b.add(cone6, '#ecc79a', { x: p.x, y: 1.9 + h + 0.9, z: p.z }, undefined, { x: 0.85, y: 1.8, z: 0.85 });
    b.add(cone6, '#3a3a44', { x: p.x, y: 1.9 + h + 1.55, z: p.z }, undefined, { x: 0.28, y: 0.6, z: 0.28 });
    collision.addCyl(p.x, p.z, 0.9, 0, 1.9 + h + 1.8);
  }

  // ---- Cardboard Quarter (south-west): boxes, some stacked for jumping ----
  const kraftCols = ['#c79a63', '#b8854f', '#d2a86f', '#a87843'];
  for (let i = 0; i < 20; i++) {
    const w = 2.4 + r() * 3.4;
    const d = 2.4 + r() * 3.4;
    const p = place(Math.max(w, d) * 0.72, -50, 46, 26);
    if (!p) continue;
    const h = 1.1 + r() * 2.2;
    const col = kraftCols[(r() * kraftCols.length) | 0];
    boxProp(p.x, 0, p.z, w, h, d, col);
    b.add(box, '#efe2bf', { x: p.x, y: h + 0.02, z: p.z }, undefined, { x: w + 0.02, y: 0.05, z: 0.5 }, false);
    if (r() < 0.45) {
      const w2 = w * (0.5 + r() * 0.3);
      const d2 = d * (0.5 + r() * 0.3);
      const h2 = 1 + r() * 1.4;
      boxProp(p.x + (r() - 0.5) * (w - w2), h, p.z + (r() - 0.5) * (d - d2), w2, h2, d2, kraftCols[(r() * 4) | 0]);
    }
  }

  // ---- The Mug (west landmark) ----
  b.add(disc, '#2bb3a3', { x: -62, y: 4, z: -8 }, undefined, { x: 6.5, y: 8, z: 6.5 });
  b.add(disc, '#5a3a22', { x: -62, y: 7.6, z: -8 }, undefined, { x: 6, y: 0.9, z: 6 }, false);
  b.add(new THREE.TorusGeometry(2.6, 0.75, 6, 12, Math.PI), '#2bb3a3', { x: -62, y: 4, z: -1.2 }, { x: 0, y: Math.PI / 2, z: -Math.PI / 2 }, { x: 1, y: 1, z: 1 });
  collision.addCyl(-62, -8, 6.5, 0, 8);
  claim(-62, -8, 9);

  // ---- Eraser blocks (cover, scattered) ----
  for (let i = 0; i < 10; i++) {
    const p = place(2.2, 0, 0, 80);
    if (!p) continue;
    const alongX = r() < 0.5;
    const w = alongX ? 3.6 : 1.8;
    const d = alongX ? 1.8 : 3.6;
    boxProp(p.x, 0, p.z, w, 1.4, d, '#f29bb0');
    b.add(box, '#3b6fb6', { x: p.x + (alongX ? 0.7 : 0), y: 0.72, z: p.z + (alongX ? 0 : 0.7) }, undefined, { x: alongX ? 1.8 : w + 0.06, y: 1.46, z: alongX ? d + 0.06 : 1.8 });
  }

  // ---- Paper cups (round cover) ----
  const stripe = ['#e5533d', '#3b82c4', '#2f9e5b', '#e0a82e'];
  for (let i = 0; i < 12; i++) {
    const p = place(1.6, 0, 0, 86);
    if (!p) continue;
    b.add(cup, '#fbf8ef', { x: p.x, y: 1.5, z: p.z });
    b.add(new THREE.CylinderGeometry(1.33, 1.24, 0.55, 10), stripe[i % 4], { x: p.x, y: 2.1, z: p.z }, undefined, undefined, false);
    collision.addCyl(p.x, p.z, 1.4, 0, 3);
  }

  // ---- Crumpled paper balls (rocks) ----
  for (let i = 0; i < 22; i++) {
    const rad = 0.8 + r() * 1.5;
    const p = place(rad, 0, 0, 90);
    if (!p) continue;
    b.add(ico, r() < 0.3 ? '#efe6cf' : '#fbf8ef', { x: p.x, y: rad * 0.82, z: p.z }, { x: r() * 3, y: r() * 3, z: r() * 3 }, { x: rad, y: rad, z: rad });
    collision.addCyl(p.x, p.z, rad * 0.85, 0, rad * 1.6);
  }

  // ---- Origami trees ----
  const greens = ['#2f9e5b', '#3fb36b', '#278a4f', '#58b86a', '#1f7a52'];
  for (let i = 0; i < 34; i++) {
    const p = place(1.4, 0, 0, 90);
    if (!p) continue;
    const s = 0.8 + r() * 0.7;
    b.add(box, '#a0703f', { x: p.x, y: 1 * s, z: p.z }, undefined, { x: 0.45 * s, y: 2 * s, z: 0.45 * s });
    const g = greens[(r() * greens.length) | 0];
    const rot = r() * 6;
    b.add(cone5, g, { x: p.x, y: 3 * s, z: p.z }, { x: 0, y: rot, z: 0 }, { x: 2.3 * s, y: 2.6 * s, z: 2.3 * s });
    b.add(cone5, g, { x: p.x, y: 4.5 * s, z: p.z }, { x: 0, y: rot + 0.6, z: 0 }, { x: 1.8 * s, y: 2.2 * s, z: 1.8 * s });
    b.add(cone5, g, { x: p.x, y: 5.8 * s, z: p.z }, { x: 0, y: rot + 1.2, z: 0 }, { x: 1.2 * s, y: 1.8 * s, z: 1.2 * s });
    collision.addCyl(p.x, p.z, 0.45 * s, 0, 7 * s);
  }

  // ---- Sticky notes on the floor (pure decoration, no outline) ----
  const notes = ['#ffe36e', '#ffb3c7', '#9fd8ff', '#b7f0a4'];
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const d = 6 + Math.sqrt(r()) * 86;
    b.add(box, notes[i % 4], { x: Math.cos(a) * d, y: 0.02, z: Math.sin(a) * d }, { x: 0, y: r() * 3, z: 0 }, { x: 2.6, y: 0.03, z: 2.6 }, false);
  }

  // ---- Origami mountains: the horizon, outside the play area ----
  const hills = ['#8fb9a8', '#a5c3d6', '#c7b8e0', '#9fc59a', '#b8cfe0'];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + r() * 0.15;
    const d = 112 + r() * 22;
    const s = 14 + r() * 14;
    b.add(cone5, hills[i % hills.length], { x: Math.cos(a) * d, y: (s * 1.6) / 2 - 0.5, z: Math.sin(a) * d }, { x: 0, y: r() * 6, z: 0 }, { x: s, y: s * 1.6, z: s });
  }

  // ---- the floor-edge fence: a ring of cardboard, low enough to see over ----
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = Math.cos(a) * (ARENA_R + 3);
    const z = Math.sin(a) * (ARENA_R + 3);
    b.add(box, i % 2 ? '#c79a63' : '#b8854f', { x, y: 1.1, z }, { x: 0, y: -a, z: 0 }, { x: 1, y: 2.2, z: 13 });
  }

  // ---- merge ----
  const merged = mergeGeometries(b.geos, false)!;
  b.geos.forEach(g => g.dispose());
  const props = new THREE.Mesh(merged, toon);
  props.matrixAutoUpdate = false;
  group.add(props);

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(b.edges, 3));
  const ink = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      uTime: { value: 0 },
      uBoil: { value: 1 },
      uColor: { value: new THREE.Color(INK) },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog)
    },
    vertexShader: INK_VERT,
    fragmentShader: INK_FRAG,
    transparent: true,
    depthWrite: false
  });
  ink.uniforms.fogColor.value = fogColor;
  const lines = new THREE.LineSegments(edgeGeo, ink);
  lines.matrixAutoUpdate = false;
  lines.renderOrder = 1;
  group.add(lines);

  // ---- floor ----
  const groundTex = notebookGround();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshToonMaterial({ map: groundTex, gradientMap: ramp }));
  ground.rotation.x = -Math.PI / 2;
  ground.updateMatrix();
  ground.matrixAutoUpdate = false;
  group.add(ground);
  // red margin line across the page
  const margin = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 300), new THREE.MeshBasicMaterial({ color: '#e26b6b', transparent: true, opacity: 0.55, depthWrite: false }));
  margin.rotation.x = -Math.PI / 2;
  margin.position.set(-24, 0.015, 0);
  margin.updateMatrix();
  margin.matrixAutoUpdate = false;
  group.add(margin);

  // ---- crate spots: spread around, never inside props ----
  const crateSpots: THREE.Vector3[] = [];
  for (let i = 0; i < 40 && crateSpots.length < 22; i++) {
    const p = place(1.2, 0, 0, 88, 60);
    if (p) crateSpots.push(new THREE.Vector3(p.x, 0, p.z));
  }
  // and on top of the Book Tower: the climb pays off
  crateSpots.push(new THREE.Vector3(0.8, 3.75, -0.4));

  box.dispose();
  hex.dispose();
  cone6.dispose();
  cone5.dispose();
  cup.dispose();
  disc.dispose();
  ico.dispose();

  const boxToon = new THREE.MeshToonMaterial({ map: kraft(), gradientMap: ramp });
  scene.add(group);

  return {
    group,
    collision,
    crateSpots,
    spawnPoint: new THREE.Vector3(0, 0, 46),
    materials: { toon, ink, boxToon },
    ramp,
    update(time: number) {
      ink.uniforms.uTime.value = time;
    },
    dispose() {
      scene.remove(group);
      merged.dispose();
      edgeGeo.dispose();
      toon.dispose();
      ink.dispose();
      grainTex.dispose();
      groundTex.dispose();
      ramp.dispose();
      boxToon.map?.dispose();
      boxToon.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      margin.geometry.dispose();
      (margin.material as THREE.Material).dispose();
    }
  };
}

const INK_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uBoil;
  #include <fog_pars_vertex>
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
  void main(){
    vec3 p = position;
    float t = floor(uTime * 6.0);
    p += (vec3(h(p + t), h(p.zxy + t * 1.3), h(p.yzx - t)) - 0.5) * 0.06 * uBoil;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const INK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  #include <fog_pars_fragment>
  void main(){
    gl_FragColor = vec4(uColor, 0.85);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
