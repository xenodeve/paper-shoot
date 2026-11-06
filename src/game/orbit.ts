/**
 * The menu backdrop's camera: a slow, breathing orbit around the Book Tower.
 * Pure (time in seconds → pose) so it is testable without WebGL.
 */
export interface OrbitPose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/** Writes into `out` when given, so a per-frame caller allocates nothing. */
export function orbitPose(t: number, out: OrbitPose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }): OrbitPose {
  const a = t * 0.06; // about one lap every 105 s
  const r = 34 + Math.sin(t * 0.11) * 6;
  out.x = Math.cos(a) * r;
  out.y = 9 + Math.sin(t * 0.17) * 2.5;
  out.z = Math.sin(a) * r;
  out.lookX = Math.sin(t * 0.07) * 1.5;
  out.lookY = 2.5;
  out.lookZ = Math.cos(t * 0.05) * 1.5;
  return out;
}
