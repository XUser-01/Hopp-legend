import { CardTier, CoachCard, PackDefinition, PlayerCard } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BallSimState {
  pos: Vec3;
  vel: Vec3;
  spin: Vec3;
  lastPos: Vec3;
  inFlight: boolean;
  shotByTeam: 'player' | 'opponent' | null;
  shotValue: 2 | 3;
  hasScoredThisFlight: boolean;
}

export interface CourtDims {
  halfWidth: number; // X extent (+/- 7.5m)
  halfLength: number; // Z extent (+/- 11.5m)
  hoopY: number; // 3.05m regulation rim height
  hoopRadius: number; // 0.23m rim inner radius
  ballRadius: number; // 0.12m basketball radius
  playerHoopZ: number; // hoop attacked by player (-9.8m)
  opponentHoopZ: number; // hoop attacked by opponent (+9.8m)
  backboardOffsetZ: number; // 0.35m behind hoop center
  threePointRadius: number; // 6.75m arc radius
}

export const COURT_DIMS: CourtDims = {
  halfWidth: 7.5,
  halfLength: 11.5,
  hoopY: 3.05,
  hoopRadius: 0.24,
  ballRadius: 0.12,
  playerHoopZ: -9.6,
  opponentHoopZ: 9.6,
  backboardOffsetZ: 0.38,
  threePointRadius: 6.45,
};

export const GRAVITY = -14.8; // tuned crisp sports gravity
export const AIR_DRAG = 0.18;

/**
 * Computes initial launch velocity (vx, vy, vz) so a projectile launched from `from`
 * reaches `target` with a clean basketball arc peaking at `peakOffset` above max(from.y, target.y),
 * compensating for horizontal air drag.
 */
export function computeShotVelocity(from: Vec3, target: Vec3, peakOffset = 1.65): Vec3 {
  const apexY = Math.max(from.y, target.y) + peakOffset;
  const g = Math.abs(GRAVITY);
  const vy = Math.sqrt(2 * g * Math.max(0.25, apexY - from.y));
  const tUp = vy / g;
  const tDown = Math.sqrt((2 * Math.max(0.05, apexY - target.y)) / g);
  const totalTime = Math.max(0.35, tUp + tDown);
  const dragFactor = AIR_DRAG / Math.max(1e-5, 1 - Math.exp(-AIR_DRAG * totalTime));

  return {
    x: (target.x - from.x) * dragFactor,
    y: vy,
    z: (target.z - from.z) * dragFactor,
  };
}

export interface ShotTimingEval {
  grade: 'perfect' | 'good' | 'early' | 'late';
  accuracy: number; // 0..1
  lateralOffset: number; // meters scatter
  depthOffset: number;
  label: string;
}

/**
 * Evaluates a shot release against the dynamic sweet spot, distance, defender contest, and player rating.
 */
export function evaluateShotRelease(params: {
  holdRatio: number; // 0..1
  sweetSpot: number; // e.g. 0.72
  distanceMeters: number;
  contestFactor: number; // 0 (open) to 1 (smothered)
  shooterRating: number; // 0..99
  stamina: number; // 0..100
  shotAssist: boolean;
  rngValue?: number; // deterministic 0..1 optional
}): ShotTimingEval {
  const {
    holdRatio,
    sweetSpot,
    distanceMeters,
    contestFactor,
    shooterRating,
    stamina,
    shotAssist,
    rngValue = 0.5,
  } = params;

  const delta = holdRatio - sweetSpot;
  const absDelta = Math.abs(delta);
  const assistMargin = shotAssist ? 0.085 : 0.055;

  let grade: ShotTimingEval['grade'];
  if (absDelta <= assistMargin) {
    grade = 'perfect';
  } else if (absDelta <= assistMargin + 0.12) {
    grade = 'good';
  } else if (delta < 0) {
    grade = 'early';
  } else {
    grade = 'late';
  }

  const ratingBonus = (shooterRating - 70) / 140; // ~ -0.15..+0.21
  const fatiguePenalty = stamina < 25 ? 0.18 : 0;
  const distancePenalty = Math.max(0, (distanceMeters - 5.5) * 0.035);
  const contestPenalty = contestFactor * 0.28;

  let baseAccuracy =
    grade === 'perfect'
      ? 0.96
      : grade === 'good'
        ? 0.74 - absDelta * 0.8
        : Math.max(0.18, 0.48 - absDelta * 0.7);

  baseAccuracy = Math.max(
    0.1,
    Math.min(0.99, baseAccuracy + ratingBonus - fatiguePenalty - distancePenalty - contestPenalty)
  );

  const willSwish = grade === 'perfect' || rngValue < baseAccuracy;
  const scatterScale = willSwish ? 0.03 : 0.28 + (1 - baseAccuracy) * 0.34;
  const angle = rngValue * Math.PI * 2;

  return {
    grade,
    accuracy: baseAccuracy,
    lateralOffset: willSwish ? 0 : Math.cos(angle) * scatterScale,
    depthOffset: willSwish ? 0 : (delta >= 0 ? 1 : -1) * Math.max(0.16, Math.abs(Math.sin(angle)) * scatterScale),
    label:
      grade === 'perfect'
        ? 'VERT PARFAIT!'
        : grade === 'good'
          ? 'BON TIMING'
          : grade === 'early'
            ? 'TROP TÔT'
            : 'TROP TARD',
  };
}

/**
 * Checks whether a shot taken from `pos` attacking `hoopZ` is worth 3 points.
 */
export function getShotPointValue(pos: Vec3, hoopZ: number): 2 | 3 {
  const dx = pos.x;
  const dz = pos.z - hoopZ;
  const dist = Math.hypot(dx, dz);
  return dist >= COURT_DIMS.threePointRadius ? 3 : 2;
}

/**
 * Determines whether a ball handler is eligible for a dunk.
 */
export function canTriggerDunk(params: {
  playerPos: Vec3;
  hoopZ: number;
  speed: number;
  stamina: number;
  dunkRating: number;
}): boolean {
  const dx = params.playerPos.x;
  const dz = params.playerPos.z - params.hoopZ;
  const distToRim = Math.hypot(dx, dz);
  const maxDunkRange = 2.6 + (params.dunkRating / 99) * 0.9;
  return distToRim <= maxDunkRange && params.stamina >= 15 && params.dunkRating >= 60 && params.speed >= 2.2;
}

export interface StepBallResult {
  scored: boolean;
  swish: boolean;
  hitRim: boolean;
  hitBackboard: boolean;
  hitFloor: boolean;
}

/**
 * Steps basketball 3D physics by `dt` seconds with rim torus collision, backboard bounce,
 * floor bounce, and basket cylinder detection. Pure & deterministic.
 */
export function stepBallPhysics(ball: BallSimState, dt: number, dims: CourtDims = COURT_DIMS): StepBallResult {
  const result: StepBallResult = {
    scored: false,
    swish: false,
    hitRim: false,
    hitBackboard: false,
    hitFloor: false,
  };

  ball.lastPos.x = ball.pos.x;
  ball.lastPos.y = ball.pos.y;
  ball.lastPos.z = ball.pos.z;

  // Air drag + gravity
  const drag = Math.exp(-AIR_DRAG * dt);
  ball.vel.x *= drag;
  ball.vel.z *= drag;
  ball.vel.y += GRAVITY * dt;

  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;
  ball.pos.z += ball.vel.z * dt;

  // Floor bounce
  if (ball.pos.y <= dims.ballRadius) {
    ball.pos.y = dims.ballRadius;
    if (Math.abs(ball.vel.y) > 0.8) {
      ball.vel.y = Math.abs(ball.vel.y) * 0.76;
      ball.vel.x *= 0.92;
      ball.vel.z *= 0.92;
      result.hitFloor = true;
    } else {
      ball.vel.y = 0;
      ball.vel.x *= 0.88;
      ball.vel.z *= 0.88;
    }
  }

  // Court wall/sideline soft containment so ball never leaves playable stadium
  if (Math.abs(ball.pos.x) > dims.halfWidth + 0.6) {
    ball.pos.x = Math.sign(ball.pos.x) * (dims.halfWidth + 0.6);
    ball.vel.x *= -0.65;
  }
  if (Math.abs(ball.pos.z) > dims.halfLength + 0.6) {
    ball.pos.z = Math.sign(ball.pos.z) * (dims.halfLength + 0.6);
    ball.vel.z *= -0.65;
  }

  // Check both hoops (backboard + rim torus + score cylinder)
  const hoopZs = [dims.playerHoopZ, dims.opponentHoopZ];
  for (const hoopZ of hoopZs) {
    const sign = Math.sign(hoopZ); // -1 for playerHoopZ (-9.6), +1 for opponentHoopZ (+9.6)
    const boardZ = hoopZ + sign * dims.backboardOffsetZ;

    // Backboard collision (1.8m wide x 1.05m tall centered around hoopY + 0.35)
    const inBoardX = Math.abs(ball.pos.x) <= 0.92;
    const inBoardY = ball.pos.y >= dims.hoopY - 0.15 && ball.pos.y <= dims.hoopY + 1.05;
    if (inBoardX && inBoardY) {
      const distToBoard = Math.abs(ball.pos.z - boardZ);
      if (distToBoard < dims.ballRadius + 0.03) {
        const pushDir = ball.pos.z < boardZ ? -1 : 1;
        ball.pos.z = boardZ + pushDir * (dims.ballRadius + 0.03);
        ball.vel.z = -ball.vel.z * 0.68;
        ball.vel.x *= 0.85;
        ball.vel.y *= 0.88;
        result.hitBackboard = true;
      }
    }

    // Rim torus collision (ring at y = hoopY, radius = hoopRadius)
    const dx = ball.pos.x;
    const dz = ball.pos.z - hoopZ;
    const radialDist = Math.hypot(dx, dz);
    if (radialDist > 0.001 && radialDist < dims.hoopRadius + dims.ballRadius + 0.15) {
      const nearestRingX = (dx / radialDist) * dims.hoopRadius;
      const nearestRingZ = hoopZ + (dz / radialDist) * dims.hoopRadius;
      const rx = ball.pos.x - nearestRingX;
      const ry = ball.pos.y - dims.hoopY;
      const rz = ball.pos.z - nearestRingZ;
      const distToRing = Math.hypot(rx, ry, rz);
      const minClearance = dims.ballRadius + 0.022; // rim tube radius ~2.2cm

      if (distToRing < minClearance && distToRing > 0.0001) {
        const nx = rx / distToRing;
        const ny = ry / distToRing;
        const nz = rz / distToRing;
        ball.pos.x = nearestRingX + nx * minClearance;
        ball.pos.y = dims.hoopY + ny * minClearance;
        ball.pos.z = nearestRingZ + nz * minClearance;

        const vDotN = ball.vel.x * nx + ball.vel.y * ny + ball.vel.z * nz;
        if (vDotN < 0) {
          const restitution = 0.56;
          ball.vel.x -= (1 + restitution) * vDotN * nx;
          ball.vel.y -= (1 + restitution) * vDotN * ny;
          ball.vel.z -= (1 + restitution) * vDotN * nz;
          result.hitRim = true;
        }
      }
    }

    // Scoring plane crossing (downward through rim cylinder)
    if (
      !ball.hasScoredThisFlight &&
      ball.lastPos.y >= dims.hoopY &&
      ball.pos.y < dims.hoopY &&
      ball.vel.y < 0
    ) {
      const horizDist = Math.hypot(ball.pos.x, ball.pos.z - hoopZ);
      if (horizDist <= dims.hoopRadius - 0.02) {
        ball.hasScoredThisFlight = true;
        result.scored = true;
        result.swish = !result.hitRim && !result.hitBackboard;
        // Net slows ball downward and centers it slightly
        ball.vel.x *= 0.35;
        ball.vel.z *= 0.35;
        ball.vel.y *= 0.65;
      }
    }
  }

  return result;
}

export interface SquadMetrics {
  teamOvr: number;
  chemistry: number; // 0..100
  attackRating: number;
  defenseRating: number;
  paceRating: number;
}

/**
 * Computes overall team rating, tactical chemistry, and unit ratings for a 5-man Dream Squad lineup.
 */
export function computeSquadMetrics(starters: PlayerCard[], coach: CoachCard): SquadMetrics {
  if (starters.length === 0) {
    return { teamOvr: 0, chemistry: 0, attackRating: 0, defenseRating: 0, paceRating: 0 };
  }

  const avgOvr = starters.reduce((s, p) => s + p.ovr, 0) / starters.length;
  const uniquePositions = new Set(starters.map((p) => p.position)).size;
  const uniqueRoles = new Set(starters.map((p) => p.role)).size;

  // Coach fit: count players whose role aligns with coach style or boosted stat >= 88
  const styleFits = starters.filter((p) => p.stats[coach.boostStat] >= 88).length;
  const chemistry = Math.min(
    100,
    Math.round(45 + uniquePositions * 6 + uniqueRoles * 4 + styleFits * 5)
  );

  const attackRating = Math.round(
    starters.reduce((s, p) => s + (p.stats.threePoint + p.stats.midRange + p.stats.dunk) / 3, 0) /
      starters.length
  );
  const defenseRating = Math.round(
    starters.reduce((s, p) => s + (p.stats.defense + p.stats.rebound) / 2, 0) / starters.length
  );
  const paceRating = Math.round(
    starters.reduce((s, p) => s + (p.stats.speed + p.stats.handle) / 2, 0) / starters.length
  );

  const teamOvr = Math.min(99, Math.round(avgOvr + coach.ovrBonus * (chemistry / 100)));

  return {
    teamOvr,
    chemistry,
    attackRating,
    defenseRating,
    paceRating,
  };
}

/**
 * Rolls a player card from a pack respecting exact probability tiers and guaranteed minimum tier.
 */
export function rollPackTier(pack: PackDefinition, rngValue: number): CardTier {
  const r = Math.max(0, Math.min(0.9999, rngValue));
  const { legende, diamant, rubis } = pack.probabilities;
  if (r < legende) return 'legende';
  if (r < legende + diamant) return 'diamant';
  if (r < legende + diamant + rubis) return 'rubis';
  return pack.guaranteedMinTier ?? 'emeraude';
}

export function rollCardFromPack(
  pack: PackDefinition,
  roster: PlayerCard[],
  ownedIds: string[],
  rngTier: number,
  rngPick: number
): PlayerCard {
  const tier = rollPackTier(pack, rngTier);
  let pool = roster.filter((c) => c.tier === tier);
  if (pool.length === 0) pool = roster;
  // Prefer unowned cards in that tier when available
  const unowned = pool.filter((c) => !ownedIds.includes(c.id));
  const finalPool = unowned.length > 0 ? unowned : pool;
  const idx = Math.min(finalPool.length - 1, Math.floor(rngPick * finalPool.length));
  return finalPool[idx];
}
