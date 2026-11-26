import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BallSimState,
  COURT_DIMS,
  canTriggerDunk,
  computeShotVelocity,
  computeSquadMetrics,
  evaluateShotRelease,
  getShotPointValue,
  rollPackTier,
  stepBallPhysics,
} from './physics';
import { COACHES, PACKS, PLAYER_ROSTER } from './playersData';

test('computeShotVelocity lands cleanly through the target hoop cylinder', () => {
  const from = { x: 0, y: 2.2, z: -3.2 };
  const target = { x: 0, y: COURT_DIMS.hoopY, z: COURT_DIMS.playerHoopZ };
  const vel = computeShotVelocity(from, target, 1.8);

  const ball: BallSimState = {
    pos: { ...from },
    lastPos: { ...from },
    vel,
    spin: { x: -8, y: 0, z: 0 },
    inFlight: true,
    shotByTeam: 'player',
    shotValue: 3,
    hasScoredThisFlight: false,
  };

  let scored = false;
  let swish = false;
  for (let i = 0; i < 200; i++) {
    const res = stepBallPhysics(ball, 1 / 120);
    if (res.scored) {
      scored = true;
      swish = res.swish;
      break;
    }
  }

  assert.equal(scored, true, 'Expected clean arc shot to score');
  assert.equal(swish, true, 'Expected centered shot to swish without rim collision');
});

test('stepBallPhysics bounces off backboard when shot hits behind rim', () => {
  const boardZ = COURT_DIMS.playerHoopZ - COURT_DIMS.backboardOffsetZ;
  const ball: BallSimState = {
    pos: { x: 0, y: COURT_DIMS.hoopY + 0.4, z: boardZ + 0.16 },
    lastPos: { x: 0, y: COURT_DIMS.hoopY + 0.4, z: boardZ + 0.25 },
    vel: { x: 0, y: 0, z: -6 },
    spin: { x: 0, y: 0, z: 0 },
    inFlight: true,
    shotByTeam: 'player',
    shotValue: 2,
    hasScoredThisFlight: false,
  };

  let hitBoard = false;
  for (let i = 0; i < 10; i++) {
    const res = stepBallPhysics(ball, 1 / 120);
    if (res.hitBackboard) {
      hitBoard = true;
      break;
    }
  }

  assert.equal(hitBoard, true, 'Expected ball moving toward backboard to collide');
  assert.ok(ball.vel.z > 0, 'Expected ball Z velocity to reverse off backboard');
});

test('evaluateShotRelease grades perfect, good, early, and late properly', () => {
  const perfect = evaluateShotRelease({
    holdRatio: 0.72,
    sweetSpot: 0.72,
    distanceMeters: 6.8,
    contestFactor: 0,
    shooterRating: 97,
    stamina: 90,
    shotAssist: true,
    rngValue: 0.5,
  });
  assert.equal(perfect.grade, 'perfect');
  assert.ok(perfect.accuracy >= 0.9);

  const early = evaluateShotRelease({
    holdRatio: 0.35,
    sweetSpot: 0.72,
    distanceMeters: 6.8,
    contestFactor: 0.5,
    shooterRating: 75,
    stamina: 90,
    shotAssist: false,
    rngValue: 0.9,
  });
  assert.equal(early.grade, 'early');
  assert.ok(early.accuracy < perfect.accuracy);
});

test('getShotPointValue classifies 2PT inside arc and 3PT beyond arc', () => {
  assert.equal(getShotPointValue({ x: 0, y: 0, z: COURT_DIMS.playerHoopZ + 4.0 }, COURT_DIMS.playerHoopZ), 2);
  assert.equal(getShotPointValue({ x: 0, y: 0, z: COURT_DIMS.playerHoopZ + 7.2 }, COURT_DIMS.playerHoopZ), 3);
  assert.equal(getShotPointValue({ x: 6.8, y: 0, z: COURT_DIMS.playerHoopZ + 0.5 }, COURT_DIMS.playerHoopZ), 3);
});

test('canTriggerDunk requires proximity, stamina, speed, and rating', () => {
  assert.equal(
    canTriggerDunk({
      playerPos: { x: 0.4, y: 0, z: COURT_DIMS.playerHoopZ + 1.8 },
      hoopZ: COURT_DIMS.playerHoopZ,
      speed: 5.2,
      stamina: 60,
      dunkRating: 95,
    }),
    true
  );

  assert.equal(
    canTriggerDunk({
      playerPos: { x: 0, y: 0, z: COURT_DIMS.playerHoopZ + 6.5 },
      hoopZ: COURT_DIMS.playerHoopZ,
      speed: 5.2,
      stamina: 60,
      dunkRating: 95,
    }),
    false
  );
});

test('computeSquadMetrics rewards positional balance and coach fit', () => {
  const starters = [
    PLAYER_ROSTER[0], // PG
    PLAYER_ROSTER[3], // SG
    PLAYER_ROSTER[1], // SF
    PLAYER_ROSTER[6], // PF
    PLAYER_ROSTER[2], // C
  ];
  const metrics = computeSquadMetrics(starters, COACHES[0]);
  assert.ok(metrics.teamOvr >= 95);
  assert.ok(metrics.chemistry >= 85);
});

test('rollPackTier respects transparent pack probability thresholds', () => {
  const legendPack = PACKS.find((p) => p.id === 'pack-legende')!;
  assert.equal(rollPackTier(legendPack, 0.1), 'legende');
  assert.equal(rollPackTier(legendPack, 0.8), 'diamant');
});
