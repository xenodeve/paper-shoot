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

export function orbitPose(t: number): OrbitPose {
  const a = t * 0.06; // about one lap every 105 s
  const r = 34 + Math.sin(t * 0.11) * 6;
  return {
    x: Math.cos(a) * r,
    y: 9 + Math.sin(t * 0.17) * 2.5,
    z: Math.sin(a) * r,
    lookX: Math.sin(t * 0.07) * 1.5,
    lookY: 2.5,
    lookZ: Math.cos(t * 0.05) * 1.5
  };
}
