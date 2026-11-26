import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGarmentClothSim,
  createJerseyClothConfig,
  createShortsClothConfig,
  getHemMeanOffset,
  stepGarmentCloth,
} from './clothPhysics';

test('pinned collar and waistband vertices remain strictly anchored across steps', () => {
  const sim = createGarmentClothSim(createJerseyClothConfig());
  for (let i = 0; i < 30; i++) {
    stepGarmentCloth(
      sim,
      {
        localVelX: 2.5,
        localVelZ: 6.8,
        worldVelY: -3.2,
        localAccelX: 12,
        localAccelY: -8,
        localAccelZ: 14,
        angularVelY: 3.5,
        elapsed: i * 0.016,
      },
      0.016
    );
  }

  for (let idx = 0; idx < sim.particleCount; idx++) {
    if (sim.pinned[idx]) {
      const i3 = idx * 3;
      assert.equal(sim.curr[i3], sim.rest[i3]);
      assert.equal(sim.curr[i3 + 1], sim.rest[i3 + 1]);
      assert.equal(sim.curr[i3 + 2], sim.rest[i3 + 2]);
    }
  }
});

test('forward running velocity trails jersey hem backward (-Z) realistically', () => {
  const sim = createGarmentClothSim(createJerseyClothConfig());
  for (let i = 0; i < 40; i++) {
    stepGarmentCloth(
      sim,
      {
        localVelX: 0,
        localVelZ: 7.2, // sprinting forward along +Z
        worldVelY: 0,
        localAccelX: 0,
        localAccelY: 0,
        localAccelZ: 0,
        angularVelY: 0,
        elapsed: i * 0.016,
      },
      0.016
    );
  }

  const offset = getHemMeanOffset(sim);
  assert.ok(offset.dz < -0.015, `Expected jersey hem to trail backward (-Z), got dz=${offset.dz}`);
});

test('falling downward velocity billows basketball shorts outward and upward', () => {
  const sim = createGarmentClothSim(createShortsClothConfig());
  for (let i = 0; i < 35; i++) {
    stepGarmentCloth(
      sim,
      {
        localVelX: 0,
        localVelZ: 0,
        worldVelY: -5.5, // falling fast after jump/dunk
        localAccelX: 0,
        localAccelY: 0,
        localAccelZ: 0,
        angularVelY: 0,
        hipPitchX: 0,
        elapsed: i * 0.016,
      },
      0.016
    );
  }

  const offset = getHemMeanOffset(sim);
  assert.ok(offset.radialFlare > 0.008, `Expected shorts hem to flare outward on descent, got ${offset.radialFlare}`);
  assert.ok(offset.dy > 0.004, `Expected upward aerodynamic lift on descent, got dy=${offset.dy}`);
});

test('lateral crossover acceleration whips jersey hem sideways in opposite direction', () => {
  const sim = createGarmentClothSim(createJerseyClothConfig());
  for (let i = 0; i < 20; i++) {
    stepGarmentCloth(
      sim,
      {
        localVelX: 3.5,
        localVelZ: 1.0,
        worldVelY: 0,
        localAccelX: 18, // explosive cut to +X
        localAccelY: 0,
        localAccelZ: 0,
        angularVelY: 0,
        elapsed: i * 0.016,
      },
      0.016
    );
  }

  const offset = getHemMeanOffset(sim);
  assert.ok(offset.dx < -0.015, `Expected cloth inertia to whip opposite (+X cut -> -X lag), got dx=${offset.dx}`);
});

test('thigh capsule collision pushes front shorts cloth forward during high knee sprint', () => {
  const sim = createGarmentClothSim(createShortsClothConfig());
  const hipPitchForward = -0.85; // thigh swings forward into +Z
  for (let i = 0; i < 25; i++) {
    stepGarmentCloth(
      sim,
      {
        localVelX: 0,
        localVelZ: 5.5,
        worldVelY: 0,
        localAccelX: 0,
        localAccelY: 0,
        localAccelZ: 0,
        angularVelY: 0,
        hipPitchX: hipPitchForward,
        elapsed: i * 0.016,
      },
      0.016
    );
  }

  // Front column (c=0, +Z) at bottom hem (r=0) should be pushed into +Z by the lifted thigh
  const frontZ = sim.curr[2];
  const restFrontZ = sim.rest[2];
  assert.ok(frontZ > restFrontZ + 0.02, `Expected lifted thigh to push front shorts cloth outward, got ${frontZ} vs rest ${restFrontZ}`);
});

test('cloth solver remains finite and bounded under extreme dt spikes', () => {
  const sim = createGarmentClothSim(createShortsClothConfig());
  for (let i = 0; i < 20; i++) {
    stepGarmentCloth(
      sim,
      {
        localVelX: 25,
        localVelZ: -25,
        worldVelY: -18,
        localAccelX: 100,
        localAccelY: 100,
        localAccelZ: -100,
        angularVelY: 30,
        hipPitchX: -1.1,
        elapsed: i * 0.1,
      },
      0.25
    );
  }

  for (let i = 0; i < sim.curr.length; i++) {
    assert.ok(Number.isFinite(sim.curr[i]), 'All cloth coordinates must remain finite');
  }
});
