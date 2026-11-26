export interface GarmentProfileRing {
  y: number;
  radius: number;
  pinned: boolean;
  stiffness?: number; // 0..1 optional elastic return toward rest pose
}

export interface GarmentConfig {
  cols: number;
  rings: GarmentProfileRing[];
  scaleX: number;
  scaleZ: number;
  damping: number;
  gravity: number;
  dragGain: number;
  inertiaGain: number;
  flutterGain: number;
  verticalBillowGain: number;
  maxStretchFromRest: number;
  colliderType: 'torso_ellipse' | 'thigh_capsule';
}

export interface ClothForceInput {
  localVelX: number;
  localVelZ: number;
  worldVelY: number;
  localAccelX: number;
  localAccelY: number;
  localAccelZ: number;
  angularVelY: number;
  hipPitchX?: number; // thigh flexion angle around local X (negative = forward swing)
  stridePhase?: number;
  elapsed: number;
}

export interface ClothConstraint {
  a: number;
  b: number;
  restLen: number;
  compliance: number; // 1.0 = rigid structural, 0.35 = soft shear/bend
}

export interface GarmentClothSim {
  config: GarmentConfig;
  cols: number;
  rows: number;
  particleCount: number;
  curr: Float32Array;
  prev: Float32Array;
  rest: Float32Array;
  pinned: Uint8Array;
  rowStiffness: Float32Array;
  ringMinRadiusX: Float32Array;
  ringMinRadiusZ: Float32Array;
  constraints: ClothConstraint[];
}

export const JERSEY_CLOTH_RINGS: GarmentProfileRing[] = [
  { y: -0.31, radius: 0.188, pinned: false, stiffness: 0.045 }, // tailored untucked jersey hem (clears waistband)
  { y: -0.23, radius: 0.184, pinned: false, stiffness: 0.075 },
  { y: -0.14, radius: 0.185, pinned: false, stiffness: 0.13 },
  { y: -0.04, radius: 0.194, pinned: false, stiffness: 0.24 },
  { y: 0.05, radius: 0.214, pinned: false, stiffness: 0.45 },   // lower ribcage
  { y: 0.13, radius: 0.228, pinned: true, stiffness: 1.0 },     // chest / lats anchored
  { y: 0.21, radius: 0.212, pinned: true, stiffness: 1.0 },     // upper chest anchored
  { y: 0.27, radius: 0.118, pinned: true, stiffness: 1.0 },     // collar anchored
];

export const SHORTS_CLOTH_RINGS: GarmentProfileRing[] = [
  { y: -0.28, radius: 0.138, pinned: false, stiffness: 0.04 },  // athletic basketball shorts hem
  { y: -0.22, radius: 0.133, pinned: false, stiffness: 0.065 },
  { y: -0.16, radius: 0.129, pinned: false, stiffness: 0.11 },
  { y: -0.10, radius: 0.125, pinned: false, stiffness: 0.2 },
  { y: -0.04, radius: 0.120, pinned: false, stiffness: 0.42 },
  { y: 0.02, radius: 0.114, pinned: true, stiffness: 1.0 },     // waistband / hip join anchored
];

export function createJerseyClothConfig(): GarmentConfig {
  return {
    cols: 16,
    rings: JERSEY_CLOTH_RINGS,
    scaleX: 1.15,
    scaleZ: 0.85,
    damping: 0.88,
    gravity: -9.81,
    dragGain: 1.25,
    inertiaGain: 0.75,
    flutterGain: 0.72,
    verticalBillowGain: 1.35,
    maxStretchFromRest: 0.085,
    colliderType: 'torso_ellipse',
  };
}

export function createShortsClothConfig(): GarmentConfig {
  return {
    cols: 14,
    rings: SHORTS_CLOTH_RINGS,
    scaleX: 1.04,
    scaleZ: 1.02,
    damping: 0.88,
    gravity: -9.81,
    dragGain: 1.55,
    inertiaGain: 0.95,
    flutterGain: 1.0,
    verticalBillowGain: 2.25,
    maxStretchFromRest: 0.14,
    colliderType: 'thigh_capsule',
  };
}

export function createGarmentClothSim(config: GarmentConfig): GarmentClothSim {
  const cols = config.cols;
  const rows = config.rings.length;
  const particleCount = cols * rows;

  const curr = new Float32Array(particleCount * 3);
  const prev = new Float32Array(particleCount * 3);
  const rest = new Float32Array(particleCount * 3);
  const pinned = new Uint8Array(particleCount);
  const rowStiffness = new Float32Array(rows);
  const ringMinRadiusX = new Float32Array(rows);
  const ringMinRadiusZ = new Float32Array(rows);

  for (let r = 0; r < rows; r++) {
    const ring = config.rings[r];
    rowStiffness[r] = ring.stiffness ?? (ring.pinned ? 1.0 : 0.05);
    ringMinRadiusX[r] = ring.radius * config.scaleX * 0.92;
    ringMinRadiusZ[r] = ring.radius * config.scaleZ * 0.92;

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const phi = (c / cols) * Math.PI * 2;
      const x = ring.radius * config.scaleX * Math.sin(phi);
      const y = ring.y;
      const z = ring.radius * config.scaleZ * Math.cos(phi);

      const i3 = idx * 3;
      curr[i3] = x;
      curr[i3 + 1] = y;
      curr[i3 + 2] = z;
      prev[i3] = x;
      prev[i3 + 1] = y;
      prev[i3 + 2] = z;
      rest[i3] = x;
      rest[i3 + 1] = y;
      rest[i3 + 2] = z;
      pinned[idx] = ring.pinned ? 1 : 0;
    }
  }

  const constraints: ClothConstraint[] = [];
  const addConstraint = (a: number, b: number, compliance: number) => {
    const a3 = a * 3;
    const b3 = b * 3;
    const dx = rest[b3] - rest[a3];
    const dy = rest[b3 + 1] - rest[a3 + 1];
    const dz = rest[b3 + 2] - rest[a3 + 2];
    const restLen = Math.hypot(dx, dy, dz);
    if (restLen > 1e-5) {
      constraints.push({ a, b, restLen, compliance });
    }
  };

  for (let r = 0; r < rows; r++) {
    const vNorm = 1 - r / Math.max(1, rows - 1);
    // Tailored athletic circumferential tension while allowing natural hem ripple & jump flare
    const ringCompliance = 0.32 + (1 - vNorm) * 0.56;

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const nextC = r * cols + ((c + 1) % cols);

      // Horizontal ring structural constraint
      addConstraint(idx, nextC, ringCompliance);

      // Vertical structural + diagonal shear constraints
      if (r + 1 < rows) {
        const up = (r + 1) * cols + c;
        const upNext = (r + 1) * cols + ((c + 1) % cols);
        addConstraint(idx, up, 0.96);
        addConstraint(idx, upNext, 0.42);
        addConstraint(nextC, up, 0.42);
      }

      // Vertical bend stiffness (2-ring skip)
      if (r + 2 < rows) {
        const up2 = (r + 2) * cols + c;
        addConstraint(idx, up2, 0.28);
      }
    }
  }

  return {
    config,
    cols,
    rows,
    particleCount,
    curr,
    prev,
    rest,
    pinned,
    rowStiffness,
    ringMinRadiusX,
    ringMinRadiusZ,
    constraints,
  };
}

/**
 * Steps garment cloth physics using Verlet integration, aerodynamic drag/flutter,
 * jump/fall billowing, acceleration inertia, structural/shear springs, and body/thigh collisions.
 * Zero heap allocations per call.
 */
export function stepGarmentCloth(
  sim: GarmentClothSim,
  forces: ClothForceInput,
  dt: number
): void {
  const clampedDt = Math.min(Math.max(dt, 0.001), 0.033);
  const substeps = 2;
  const subDt = clampedDt / substeps;
  const subDtSq = subDt * subDt;

  const {
    cols,
    rows,
    curr,
    prev,
    rest,
    pinned,
    rowStiffness,
    ringMinRadiusX,
    ringMinRadiusZ,
    constraints,
    config,
  } = sim;

  const horizSpeed = Math.hypot(forces.localVelX, forces.localVelZ);
  const clampedAccelX = Math.max(-26, Math.min(26, forces.localAccelX));
  const clampedAccelY = Math.max(-26, Math.min(26, forces.localAccelY));
  const clampedAccelZ = Math.max(-26, Math.min(26, forces.localAccelZ));
  const damping = Math.pow(config.damping, subDt * 60);

  // Thigh capsule vector in pelvisGroup space (origin at hip socket)
  const hipPitch = forces.hipPitchX ?? 0;
  const thighDirY = -Math.cos(hipPitch);
  const thighDirZ = -Math.sin(hipPitch);
  const thighLen = 0.42;
  const isShorts = config.colliderType === 'thigh_capsule';
  const cosCarry = isShorts ? Math.cos(hipPitch * 0.58) : 1;
  const sinCarry = isShorts ? Math.sin(hipPitch * 0.58) : 0;

  for (let step = 0; step < substeps; step++) {
    // 1. Verlet integration + aerodynamic & inertial forces
    for (let r = 0; r < rows; r++) {
      const freeFactor = 1 - rowStiffness[r] * 0.65;
      const vNorm = 1 - r / Math.max(1, rows - 1); // 0 at top -> 1 at loose hem

      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const i3 = idx * 3;
        if (pinned[idx]) {
          curr[i3] = rest[i3];
          curr[i3 + 1] = rest[i3 + 1];
          curr[i3 + 2] = rest[i3 + 2];
          prev[i3] = rest[i3];
          prev[i3 + 1] = rest[i3 + 1];
          prev[i3 + 2] = rest[i3 + 2];
          continue;
        }

        const x = curr[i3];
        const y = curr[i3 + 1];
        const z = curr[i3 + 2];

        const vx = (x - prev[i3]) * damping;
        const vy = (y - prev[i3 + 1]) * damping;
        const vz = (z - prev[i3 + 2]) * damping;

        prev[i3] = x;
        prev[i3 + 1] = y;
        prev[i3 + 2] = z;

        // Target memory position (for shorts, follows partial thigh carry so front never tunnels behind femur)
        const targetRestX = rest[i3];
        let targetRestY = rest[i3 + 1];
        let targetRestZ = rest[i3 + 2];
        if (isShorts && hipPitch !== 0) {
          const blend = vNorm;
          const rotY = targetRestY * cosCarry - targetRestZ * sinCarry;
          const rotZ = targetRestY * sinCarry + targetRestZ * cosCarry;
          targetRestY = targetRestY + (rotY - targetRestY) * blend;
          targetRestZ = targetRestZ + (rotZ - targetRestZ) * blend;
        }

        // Radial unit direction in XZ plane for billowing & flutter waves
        const radialLen = Math.hypot(x, z) || 1e-4;
        const rx = x / radialLen;
        const rz = z / radialLen;

        // Gravity + elastic fabric memory toward rest drape
        let ax = (targetRestX - x) * rowStiffness[r] * 38;
        let ay = config.gravity * 0.35 + (targetRestY - y) * rowStiffness[r] * 38;
        let az = (targetRestZ - z) * rowStiffness[r] * 38;

        // Thigh lift impulse on shorts when femur swings forward/backward
        if (isShorts && hipPitch !== 0) {
          az += -Math.sin(hipPitch) * 14.5 * vNorm;
          ay += (1 - Math.cos(hipPitch)) * 5.2 * vNorm;
        }

        // D'Alembert inertial lag from running acceleration & quick crossovers
        ax -= clampedAccelX * config.inertiaGain * (0.4 + vNorm * 0.85);
        ay -= clampedAccelY * config.inertiaGain * 0.35;
        az -= clampedAccelZ * config.inertiaGain * (0.4 + vNorm * 0.85);

        // Air drag trails cloth behind movement direction
        ax -= forces.localVelX * config.dragGain * (0.35 + vNorm * 0.95);
        az -= forces.localVelZ * config.dragGain * (0.35 + vNorm * 0.95);

        // Angular turn whip (centrifugal + tangential lag during spins/pivots)
        const angVel = Math.max(-10, Math.min(10, forces.angularVelY));
        ax += (z * angVel * 1.15 + rx * angVel * angVel * 0.14) * vNorm;
        az += (-x * angVel * 1.15 + rz * angVel * angVel * 0.14) * vNorm;

        // Jump & fall vertical airflow billowing (falling blows hem upward & outward; rising pulls down)
        const vVel = forces.worldVelY;
        const airSpeedY = Math.abs(vVel);
        if (airSpeedY > 0.15) {
          const flarePush = airSpeedY * config.verticalBillowGain * vNorm * 2.4;
          ax += rx * flarePush;
          az += rz * flarePush;
          // Downward fall pushes cloth up; upward jump drags cloth slightly down
          ay += -vVel * config.verticalBillowGain * (0.55 + vNorm * 1.15);
        }

        // High-frequency aerodynamic fabric ripple while running/sprinting
        if (horizSpeed > 0.35) {
          const phi = (c / cols) * Math.PI * 2;
          const wave =
            Math.sin(forces.elapsed * (11.5 + horizSpeed * 1.8) + phi * 2.0 - r * 0.85) *
            Math.min(1.6, horizSpeed / 4.2) *
            config.flutterGain *
            vNorm;
          ax += rx * wave * 4.8;
          az += rz * wave * 4.8;
        }

        curr[i3] = x + vx + ax * subDtSq * freeFactor;
        curr[i3 + 1] = y + vy + ay * subDtSq * freeFactor;
        curr[i3 + 2] = z + vz + az * subDtSq * freeFactor;
      }
    }

    // 2. Iterative spring constraint relaxation
    const iterations = 3;
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < constraints.length; i++) {
        const con = constraints[i];
        const a3 = con.a * 3;
        const b3 = con.b * 3;
        const dx = curr[b3] - curr[a3];
        const dy = curr[b3 + 1] - curr[a3 + 1];
        const dz = curr[b3 + 2] - curr[a3 + 2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-6) continue;

        const diff = ((dist - con.restLen) / dist) * con.compliance;
        const aPinned = pinned[con.a];
        const bPinned = pinned[con.b];

        if (aPinned && bPinned) continue;
        if (aPinned) {
          curr[b3] -= dx * diff;
          curr[b3 + 1] -= dy * diff;
          curr[b3 + 2] -= dz * diff;
        } else if (bPinned) {
          curr[a3] += dx * diff;
          curr[a3 + 1] += dy * diff;
          curr[a3 + 2] += dz * diff;
        } else {
          const half = diff * 0.5;
          curr[a3] += dx * half;
          curr[a3 + 1] += dy * half;
          curr[a3 + 2] += dz * half;
          curr[b3] -= dx * half;
          curr[b3 + 1] -= dy * half;
          curr[b3 + 2] -= dz * half;
        }
      }

      // 3. Body / Limb collision + safety stretch tether
      for (let r = 0; r < rows; r++) {
        const minRx = ringMinRadiusX[r];
        const minRz = ringMinRadiusZ[r];

        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (pinned[idx]) continue;
          const i3 = idx * 3;

          if (config.colliderType === 'torso_ellipse') {
            // Keep jersey outside inner elliptical ribcage/waist core
            const nx = curr[i3] / minRx;
            const nz = curr[i3 + 2] / minRz;
            const ellDist = Math.hypot(nx, nz);
            if (ellDist < 1.0 && ellDist > 1e-5) {
              const push = 1.0 / ellDist;
              curr[i3] *= push;
              curr[i3 + 2] *= push;
            }
          } else {
            // Thigh capsule collision for loose basketball shorts leg
            const px = curr[i3];
            const py = curr[i3 + 1];
            const pz = curr[i3 + 2];
            const proj = Math.max(0, Math.min(thighLen, py * thighDirY + pz * thighDirZ));
            const cx = 0;
            const cy = thighDirY * proj;
            const cz = thighDirZ * proj;
            const dx = px - cx;
            const dy = py - cy;
            const dz = pz - cz;
            const d = Math.hypot(dx, dy, dz);
            const thighRad = 0.098 - (proj / thighLen) * 0.02 + 0.018;
            if (d < thighRad && d > 1e-5) {
              const s = thighRad / d;
              curr[i3] = cx + dx * s;
              curr[i3 + 1] = cy + dy * s;
              curr[i3 + 2] = cz + dz * s;
            }
          }

          // Clamp max excursion from target thigh-carried pose so high knees never get held back while fabric never explodes
          let refX = rest[i3];
          let refY = rest[i3 + 1];
          let refZ = rest[i3 + 2];
          if (isShorts && hipPitch !== 0) {
            const vNorm = 1 - r / Math.max(1, rows - 1);
            const rotY = refY * cosCarry - refZ * sinCarry;
            const rotZ = refY * sinCarry + refZ * cosCarry;
            refY = refY + (rotY - refY) * vNorm;
            refZ = refZ + (rotZ - refZ) * vNorm;
          }
          const ox = curr[i3] - refX;
          const oy = curr[i3 + 1] - refY;
          const oz = curr[i3 + 2] - refZ;
          const offsetLen = Math.hypot(ox, oy, oz);
          if (offsetLen > config.maxStretchFromRest) {
            const clampScale = config.maxStretchFromRest / offsetLen;
            curr[i3] = refX + ox * clampScale;
            curr[i3 + 1] = refY + oy * clampScale;
            curr[i3 + 2] = refZ + oz * clampScale;
          }
        }
      }
    }
  }
}

/**
 * Helper to read the average displacement of the bottom hem ring (row 0) for diagnostics/tests.
 */
export function getHemMeanOffset(sim: GarmentClothSim): { dx: number; dy: number; dz: number; radialFlare: number } {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let radialFlare = 0;
  for (let c = 0; c < sim.cols; c++) {
    const i3 = c * 3;
    dx += sim.curr[i3] - sim.rest[i3];
    dy += sim.curr[i3 + 1] - sim.rest[i3 + 1];
    dz += sim.curr[i3 + 2] - sim.rest[i3 + 2];
    const rCurr = Math.hypot(sim.curr[i3], sim.curr[i3 + 2]);
    const rRest = Math.hypot(sim.rest[i3], sim.rest[i3 + 2]);
    radialFlare += rCurr - rRest;
  }
  const n = sim.cols;
  return { dx: dx / n, dy: dy / n, dz: dz / n, radialFlare: radialFlare / n };
}
