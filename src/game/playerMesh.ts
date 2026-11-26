import * as THREE from 'three';
import {
  createGarmentClothSim,
  createJerseyClothConfig,
  createShortsClothConfig,
  GarmentClothSim,
  stepGarmentCloth,
} from './clothPhysics';
import {
  createFaceTexture,
  createJerseyTexture,
  createRefereeTexture,
  createShortsTexture,
} from './textures';
import { PlayerCard } from './types';

export interface PlayerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pelvisGroup: THREE.Group;
  upperTorsoGroup: THREE.Group;
  torso: THREE.Mesh;
  leftShortsMesh: THREE.Mesh;
  rightShortsMesh: THREE.Mesh;
  jerseyCloth: GarmentClothSim;
  leftShortsCloth: GarmentClothSim;
  rightShortsCloth: GarmentClothSim;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightAnkle: THREE.Group;
  rightHandAnchor: THREE.Object3D;
  contactShadow: THREE.Mesh;
  leftFootShadow: THREE.Mesh;
  rightFootShadow: THREE.Mesh;
  selectionRing: THREE.Mesh;
  jerseyMaterial: THREE.MeshStandardMaterial;
  shortsMaterial: THREE.MeshStandardMaterial;
  skinMaterial: THREE.MeshStandardMaterial;
  heightScale: number;
  wingspanScale: number;
}

export interface PlayerAnimInput {
  speed: number;
  maxSpeed: number;
  stridePhase: number;
  verticalY: number;
  localVelX: number;
  localVelZ: number;
  worldVelY: number;
  localAccelX: number;
  localAccelY: number;
  localAccelZ: number;
  angularVelY: number;
  isDribbling: boolean;
  dribbleCycle: number;
  isShooting: boolean;
  shootWindup: number; // 0..1
  isDunking: boolean;
  dunkProgress: number; // 0..1
  isCrossover: boolean;
  crossoverProgress: number; // 0..1
  isDefending: boolean;
  isBlocking: boolean;
  blockTimer: number;
  squashY: number;
  turnBank: number; // -1..1 lateral lean into turns
  lookYaw: number; // relative head look toward ball/hoop
  isControlled: boolean;
  hasBall: boolean;
}

export type RefereeSignal = 'none' | 'three_attempt' | 'three_good' | 'two_good' | 'whistle_stop';

export interface RefereeRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pelvisGroup: THREE.Group;
  upperTorsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightAnkle: THREE.Group;
  contactShadow: THREE.Mesh;
  leftFootShadow: THREE.Mesh;
  rightFootShadow: THREE.Mesh;
}

const sharedShadowGeo = new THREE.CircleGeometry(0.48, 24);
const sharedFootShadowGeo = new THREE.CircleGeometry(0.19, 16);
const sharedRingGeo = new THREE.RingGeometry(0.46, 0.54, 32);

// Shared anatomical torso profile (V-taper athletic silhouette)
const TORSO_PROFILE = [
  new THREE.Vector2(0.155, -0.26),
  new THREE.Vector2(0.168, -0.14),
  new THREE.Vector2(0.198, -0.02),
  new THREE.Vector2(0.228, 0.11),
  new THREE.Vector2(0.212, 0.21),
  new THREE.Vector2(0.118, 0.27),
];
const sharedTorsoGeo = new THREE.LatheGeometry(TORSO_PROFILE, 20);

// Shared sculpted calf profile (gastrocnemius taper down to Achilles ankle)
const CALF_PROFILE = [
  new THREE.Vector2(0.036, -0.34),
  new THREE.Vector2(0.044, -0.22),
  new THREE.Vector2(0.064, -0.08),
  new THREE.Vector2(0.061, 0.0),
];
const sharedCalfGeo = new THREE.LatheGeometry(CALF_PROFILE, 14);

const sharedQuadGeo = new THREE.CylinderGeometry(0.088, 0.064, 0.36, 14);
const sharedUpperArmGeo = new THREE.CylinderGeometry(0.058, 0.046, 0.28, 12);
const sharedForearmGeo = new THREE.CylinderGeometry(0.047, 0.033, 0.26, 12);

// Temp vectors for foot shadow world-projection (zero GC)
const _footWorld = new THREE.Vector3();
const _rootWorld = new THREE.Vector3();

/**
 * Builds an indexed BufferGeometry with seamless UV wrapping (cols + 1) matching LatheGeometry's
 * UV convention so procedural jersey & shorts textures map cleanly and deform smoothly per frame.
 */
function createClothBufferGeometry(sim: GarmentClothSim): THREE.BufferGeometry {
  const { cols, rows, curr } = sim;
  const stride = cols + 1;
  const vertCount = stride * rows;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  for (let r = 0; r < rows; r++) {
    const v = r / Math.max(1, rows - 1);
    for (let c = 0; c <= cols; c++) {
      const srcC = c % cols;
      const src3 = (r * cols + srcC) * 3;
      const dst = r * stride + c;
      const dst3 = dst * 3;
      const dst2 = dst * 2;
      positions[dst3] = curr[src3];
      positions[dst3 + 1] = curr[src3 + 1];
      positions[dst3 + 2] = curr[src3 + 2];
      uvs[dst2] = c / cols;
      uvs[dst2 + 1] = v;
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = r * stride + (c + 1);
      const cVert = (r + 1) * stride + c;
      const d = (r + 1) * stride + (c + 1);
      indices.push(a, b, d);
      indices.push(a, d, cVert);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Copies Verlet particle coordinates to GPU BufferGeometry and smooths seam normals.
 */
function syncClothGeometry(sim: GarmentClothSim, geo: THREE.BufferGeometry): void {
  const { cols, rows, curr } = sim;
  const stride = cols + 1;
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const srcC = c % cols;
      const src3 = (r * cols + srcC) * 3;
      const dst3 = (r * stride + c) * 3;
      arr[dst3] = curr[src3];
      arr[dst3 + 1] = curr[src3 + 1];
      arr[dst3 + 2] = curr[src3 + 2];
    }
  }
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  // Blend seam normals between u=0 and u=1 so no vertical shading crease appears on front chest/shorts
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  for (let r = 0; r < rows; r++) {
    const i0 = r * stride;
    const iEnd = i0 + cols;
    const nx = normAttr.getX(i0) + normAttr.getX(iEnd);
    const ny = normAttr.getY(i0) + normAttr.getY(iEnd);
    const nz = normAttr.getZ(i0) + normAttr.getZ(iEnd);
    const len = Math.hypot(nx, ny, nz) || 1;
    normAttr.setXYZ(i0, nx / len, ny / len, nz / len);
    normAttr.setXYZ(iEnd, nx / len, ny / len, nz / len);
  }
  normAttr.needsUpdate = true;
}

function buildRealisticSneaker(
  sneakerMat: THREE.Material,
  soleMat: THREE.Material,
  trimMat: THREE.Material
): THREE.Group {
  const shoe = new THREE.Group();

  // Outsole + sculpted cushioned midsole
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.032, 0.268), soleMat);
  sole.position.set(0, -0.02, 0.052);
  sole.castShadow = true;
  shoe.add(sole);

  // Main upper vamp
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.068, 0.245), sneakerMat);
  upper.position.set(0, 0.025, 0.046);
  upper.castShadow = true;
  shoe.add(upper);

  // Tapered rounded toe box
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), sneakerMat);
  toe.scale.set(1.0, 0.65, 1.15);
  toe.position.set(0, 0.015, 0.145);
  toe.castShadow = true;
  shoe.add(toe);

  // High-top padded ankle collar + tongue
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.056, 0.068, 12), sneakerMat);
  collar.position.set(0, 0.072, -0.018);
  collar.castShadow = true;
  shoe.add(collar);

  const accentStripe = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.018, 0.14), trimMat);
  accentStripe.position.set(0, 0.022, 0.04);
  shoe.add(accentStripe);

  return shoe;
}

function buildSculptedHand(skinMat: THREE.Material): THREE.Group {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.076, 0.032), skinMat);
  palm.castShadow = true;
  hand.add(palm);

  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.046, 0.022), skinMat);
  fingers.position.set(0, -0.052, 0.006);
  hand.add(fingers);

  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.028, 4, 6), skinMat);
  thumb.position.set(0.032, -0.012, 0.016);
  thumb.rotation.z = -0.45;
  hand.add(thumb);

  return hand;
}

/**
 * Builds an articulated realistic 3D basketball superstar rig scaled to real heightCm & wingspanCm,
 * featuring V-taper anatomical torso, sculpted facial geometry + portrait texture, and grounded foot shadows.
 */
export function buildPlayerRig(
  card: PlayerCard,
  shadowTexture: THREE.Texture,
  teamSide: 'player' | 'opponent',
  jerseyOverrideColor?: string | null
): PlayerRig {
  const root = new THREE.Group();
  const heightScale = card.heightCm / 198;
  const wingspanScale = card.wingspanCm / 206;
  const shoulderBulk = card.id === 'shaq-34' ? 1.18 : card.id === 'wemby-1' ? 0.92 : 1.02;

  const primary =
    teamSide === 'opponent'
      ? '#C81E1E'
      : jerseyOverrideColor || card.primaryColor;
  const secondary = teamSide === 'opponent' ? '#18181B' : card.secondaryColor;

  const isStern =
    card.id === 'lebron-23' ||
    card.id === 'jordan-23' ||
    card.id === 'kobe-24' ||
    card.id === 'giannis-34';

  const skinMat = new THREE.MeshStandardMaterial({
    color: card.appearance.skinTone,
    roughness: 0.48,
    metalness: 0.04,
  });

  const faceTex = createFaceTexture(
    card.appearance.skinTone,
    card.appearance.hairColor,
    card.appearance.facialHair,
    '#241811',
    isStern
  );
  const headMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: card.appearance.hairStyle === 'bald' ? 0.36 : 0.46,
    metalness: 0.03,
  });

  const jerseyTex = createJerseyTexture(primary, secondary, card.jerseyNumber, card.shortName);
  const jerseyMat = new THREE.MeshStandardMaterial({
    map: jerseyTex,
    roughness: 0.82,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });

  const shortsTex = createShortsTexture(primary, secondary);
  const shortsMat = new THREE.MeshStandardMaterial({
    map: shortsTex,
    roughness: 0.84,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });

  const shortsTrunkMat = new THREE.MeshStandardMaterial({
    color: primary,
    roughness: 0.84,
    metalness: 0.03,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: secondary,
    roughness: 0.45,
    metalness: 0.16,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: card.appearance.hairColor,
    roughness: 0.9,
    metalness: 0.0,
  });

  const sneakerMat = new THREE.MeshStandardMaterial({
    color: card.appearance.sneakerColor,
    roughness: 0.32,
    metalness: 0.15,
  });

  const soleMat = new THREE.MeshStandardMaterial({
    color: '#F8FAFC',
    roughness: 0.42,
    metalness: 0.05,
  });

  const sleeveMat = new THREE.MeshStandardMaterial({
    color: teamSide === 'opponent' ? '#111827' : '#0F172A',
    roughness: 0.72,
    metalness: 0.05,
  });

  // Ground contact shadow + per-foot shadows + active selection ring
  const contactShadow = new THREE.Mesh(
    sharedShadowGeo,
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.014;
  root.add(contactShadow);

  const makeFootShadow = () => {
    const m = new THREE.Mesh(
      sharedFootShadowGeo,
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.017;
    root.add(m);
    return m;
  };
  const leftFootShadow = makeFootShadow();
  const rightFootShadow = makeFootShadow();

  const selectionRing = new THREE.Mesh(
    sharedRingGeo,
    new THREE.MeshBasicMaterial({
      color: teamSide === 'player' ? '#F59E0B' : '#EF4444',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: teamSide === 'player' ? 0.88 : 0.0,
      depthWrite: false,
    })
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.022;
  root.add(selectionRing);

  // Articulated body container
  const bodyGroup = new THREE.Group();
  bodyGroup.scale.set(
    (0.96 + (heightScale - 1) * 0.42) * shoulderBulk,
    heightScale,
    (0.96 + (heightScale - 1) * 0.42) * shoulderBulk
  );
  root.add(bodyGroup);

  // Pelvis / Hips container (drives independent hip twist, bob & lateral sway)
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.96, 0);
  bodyGroup.add(pelvisGroup);

  const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.205, 0.24, 16), shortsTrunkMat);
  pelvisMesh.scale.set(1.1, 1.0, 0.82);
  pelvisMesh.castShadow = true;
  pelvisGroup.add(pelvisMesh);

  const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.044, 16), trimMat);
  waistband.scale.set(1.1, 1.0, 0.82);
  waistband.position.y = 0.122;
  pelvisGroup.add(waistband);

  // Upper Torso spine container (counter-rotates against hips & leans into sprints/shots)
  const upperTorsoGroup = new THREE.Group();
  upperTorsoGroup.position.set(0, 0.13, 0);
  pelvisGroup.add(upperTorsoGroup);

  // Inner anatomical ribcage/core under-layer so billowing jersey hem never reveals hollow interior
  const torsoCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.14, 0.4, 12),
    skinMat
  );
  torsoCore.scale.set(1.02, 1.0, 0.68);
  torsoCore.position.y = 0.25;
  upperTorsoGroup.add(torsoCore);

  // Dynamic cloth jersey mesh (V-taper upper chest anchored, loose waist & hem simulated per-frame)
  const jerseyCloth = createGarmentClothSim(createJerseyClothConfig());
  const jerseyGeo = createClothBufferGeometry(jerseyCloth);
  const torso = new THREE.Mesh(jerseyGeo, jerseyMat);
  torso.position.y = 0.27;
  torso.castShadow = true;
  upperTorsoGroup.add(torso);

  // Trapezius & sculpted shoulder yoke
  const traps = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 6, 10), skinMat);
  traps.rotation.z = Math.PI / 2;
  traps.position.set(0, 0.51, -0.01);
  traps.castShadow = true;
  upperTorsoGroup.add(traps);

  // Neck & Sculpted Recognizable Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.072, 0.12, 12), skinMat);
  neck.position.set(0, 0.59, 0.005);
  neck.castShadow = true;
  upperTorsoGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.735, 0.015);
  upperTorsoGroup.add(headGroup);

  // Textured cranium (rotated -PI/2 so face at u=0.5 faces +Z forward)
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.118, 22, 18), headMat);
  cranium.scale.set(0.95, 1.1, 0.9); // Note: scaled before rotation means X->Z, Z->X, so use 0.90 X, 1.10 Y, 0.95 Z after rot
  cranium.rotation.y = -Math.PI / 2;
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Sculpted 3D Nose Bridge, Brow Ridge, Chin & Ears
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.044, 0.032), skinMat);
  nose.position.set(0, -0.014, 0.106);
  nose.rotation.x = -0.22;
  headGroup.add(nose);

  const jawChin = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), skinMat);
  jawChin.scale.set(0.92, 0.85, 0.88);
  jawChin.position.set(0, -0.068, 0.046);
  headGroup.add(jawChin);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat);
    ear.scale.set(0.45, 1.15, 0.75);
    ear.position.set(side * 0.104, -0.006, 0.0);
    headGroup.add(ear);
  });

  // Hair variations
  const hs = card.appearance.hairStyle;
  if (hs === 'fade' || hs === 'short_crop') {
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
      hairMat
    );
    hairCap.scale.set(0.92, 1.04, 0.96);
    hairCap.position.set(0, 0.022, -0.012);
    hairCap.rotation.x = -0.24;
    headGroup.add(hairCap);
  } else if (hs === 'curly_high' || hs === 'afro_taper') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.105, 0.095, 16), hairMat);
    crown.position.set(0, 0.114, -0.016);
    headGroup.add(crown);
    const backFade = new THREE.Mesh(
      new THREE.SphereGeometry(0.119, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.46),
      hairMat
    );
    backFade.position.set(0, 0.022, -0.015);
    backFade.rotation.x = -0.26;
    headGroup.add(backFade);
  } else if (hs === 'braids') {
    for (let b = -2; b <= 2; b++) {
      const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.13, 4, 8), hairMat);
      braid.position.set(b * 0.032, 0.058, -0.056);
      braid.rotation.x = 0.52;
      headGroup.add(braid);
    }
  }

  // 3D Beard / Goatee silhouette enhancement
  if (card.appearance.facialHair === 'full_beard') {
    const beard = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.056, 0.082, 14), hairMat);
    beard.position.set(0, -0.075, 0.044);
    headGroup.add(beard);
  } else if (card.appearance.facialHair === 'goatee') {
    const goatee = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.045, 0.034), hairMat);
    goatee.position.set(0, -0.082, 0.084);
    headGroup.add(goatee);
  }

  if (card.appearance.headband) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.017, 8, 24), trimMat);
    band.rotation.x = Math.PI / 2 - 0.08;
    band.position.set(0, 0.055, 0.004);
    headGroup.add(band);
  }

  // Sculpted Arms (deltoid cap -> bicep -> elbow -> forearm -> wristband -> sculpted hand)
  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.258, 0.49, 0);
    upperTorsoGroup.add(shoulder);

    const hasSleeve =
      card.appearance.armSleeve === 'both' ||
      (side === -1 && card.appearance.armSleeve === 'left') ||
      (side === 1 && card.appearance.armSleeve === 'right');

    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), skinMat);
    deltoid.scale.set(1.05, 1.15, 0.95);
    deltoid.castShadow = true;
    shoulder.add(deltoid);

    const upperArm = new THREE.Mesh(sharedUpperArmGeo, hasSleeve ? sleeveMat : skinMat);
    upperArm.scale.set(1, wingspanScale, 1);
    upperArm.position.y = -0.14 * wingspanScale;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.28 * wingspanScale;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(sharedForearmGeo, hasSleeve ? sleeveMat : skinMat);
    forearm.scale.set(1, wingspanScale, 1);
    forearm.position.y = -0.13 * wingspanScale;
    forearm.castShadow = true;
    elbow.add(forearm);

    const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.037, 0.048, 10), trimMat);
    wristband.position.y = -0.24 * wingspanScale;
    elbow.add(wristband);

    const hand = buildSculptedHand(skinMat);
    hand.position.y = -0.295 * wingspanScale;
    elbow.add(hand);

    return { shoulder, elbow, hand };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  const rightHandAnchor = new THREE.Object3D();
  rightHandAnchor.position.set(0, -0.34 * wingspanScale, 0.06);
  rightArm.elbow.add(rightHandAnchor);

  // Sculpted Legs (thighs -> knee -> sculpted calf -> ankle -> 4-part sneaker)
  // Shorts legs are mounted in pelvisGroup with real thigh capsule collision & dynamic cloth simulation
  const leftShortsCloth = createGarmentClothSim(createShortsClothConfig());
  const rightShortsCloth = createGarmentClothSim(createShortsClothConfig());

  const leftShortsMesh = new THREE.Mesh(createClothBufferGeometry(leftShortsCloth), shortsMat);
  leftShortsMesh.position.set(-0.112, -0.07, 0);
  leftShortsMesh.castShadow = true;
  pelvisGroup.add(leftShortsMesh);

  const rightShortsMesh = new THREE.Mesh(createClothBufferGeometry(rightShortsCloth), shortsMat);
  rightShortsMesh.position.set(0.112, -0.07, 0);
  rightShortsMesh.castShadow = true;
  pelvisGroup.add(rightShortsMesh);

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.112, -0.07, 0);
    pelvisGroup.add(hip);

    const quad = new THREE.Mesh(sharedQuadGeo, skinMat);
    quad.position.y = -0.25;
    quad.castShadow = true;
    hip.add(quad);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);

    const kneecap = new THREE.Mesh(
      new THREE.SphereGeometry(0.062, 10, 8),
      card.appearance.legSleeve && side === 1 ? sleeveMat : skinMat
    );
    kneecap.position.set(0, 0, 0.012);
    knee.add(kneecap);

    const calf = new THREE.Mesh(
      sharedCalfGeo,
      card.appearance.legSleeve && side === 1 ? sleeveMat : skinMat
    );
    calf.position.y = -0.03;
    calf.castShadow = true;
    knee.add(calf);

    const ankle = new THREE.Group();
    ankle.position.y = -0.37;
    knee.add(ankle);

    const shoe = buildRealisticSneaker(sneakerMat, soleMat, trimMat);
    ankle.add(shoe);

    return { hip, knee, ankle };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  return {
    root,
    bodyGroup,
    pelvisGroup,
    upperTorsoGroup,
    torso,
    leftShortsMesh,
    rightShortsMesh,
    jerseyCloth,
    leftShortsCloth,
    rightShortsCloth,
    headGroup,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    leftAnkle: leftLeg.ankle,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightAnkle: rightLeg.ankle,
    rightHandAnchor,
    contactShadow,
    leftFootShadow,
    rightFootShadow,
    selectionRing,
    jerseyMaterial: jerseyMat,
    shortsMaterial: shortsMat,
    skinMaterial: skinMat,
    heightScale,
    wingspanScale,
  };
}

/**
 * Updates articulated skeletal kinematics smoothly with biomechanical stride bob,
 * pelvic twist, spinal counter-rotation, heel-to-toe ankle roll, turn banking, and per-foot shadows.
 */
export function animatePlayerRig(rig: PlayerRig, anim: PlayerAnimInput, dt: number, elapsed: number) {
  const k = 1 - Math.exp(-16 * dt);
  const moveFactor = Math.min(1, anim.speed / Math.max(0.5, anim.maxSpeed));

  // Squash-and-stretch + turn banking lean
  const baseScaleX = (0.96 + (rig.heightScale - 1) * 0.42) / Math.sqrt(Math.max(0.75, anim.squashY));
  const baseScaleY = rig.heightScale * anim.squashY;
  rig.bodyGroup.scale.set(
    THREE.MathUtils.lerp(rig.bodyGroup.scale.x, baseScaleX, k),
    THREE.MathUtils.lerp(rig.bodyGroup.scale.y, baseScaleY, k),
    THREE.MathUtils.lerp(rig.bodyGroup.scale.z, baseScaleX, k)
  );
  rig.bodyGroup.position.y = anim.verticalY;
  rig.bodyGroup.rotation.z = THREE.MathUtils.lerp(
    rig.bodyGroup.rotation.z,
    -anim.turnBank * 0.16 * moveFactor,
    k
  );

  // Contact shadow & selection ring
  const airRatio = Math.min(1, anim.verticalY / 1.4);
  const shadowScale = THREE.MathUtils.lerp(1.0, 0.58, airRatio);
  rig.contactShadow.scale.set(shadowScale, shadowScale, 1);
  (rig.contactShadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(0.46, 0.16, airRatio);
  (rig.selectionRing.material as THREE.MeshBasicMaterial).opacity = anim.isControlled ? 0.9 : 0.0;

  // Target joint & spine angles
  let pelvisY = 0.96;
  let pelvisX = 0;
  let pelvisYaw = 0;
  let pelvisRoll = 0;
  let torsoLeanX = 0;
  let torsoYaw = 0;

  let lHipX = 0;
  let rHipX = 0;
  let lKneeX = 0;
  let rKneeX = 0;
  let lAnkleX = 0;
  let rAnkleX = 0;

  let lShX = 0;
  let lShZ = -0.18;
  let lElbX = -0.35;
  let rShX = 0;
  let rShZ = 0.18;
  let rElbX = -0.35;

  if (anim.isDunking) {
    // Explosive tomahawk / hangtime dunk pose
    const p = anim.dunkProgress;
    pelvisY = 0.92;
    torsoLeanX = 0.24 - p * 0.1;
    rShX = -2.75 + p * 0.65;
    rElbX = -0.22;
    lShX = -2.1;
    lElbX = -0.45;
    lHipX = -0.58;
    rHipX = -0.34;
    lKneeX = 1.05;
    rKneeX = 0.78;
    lAnkleX = 0.35;
    rAnkleX = 0.35;
  } else if (anim.isShooting) {
    // Authentic 2-phase NBA jump shot: (0..0.35) gather crouch -> (0.35..1.0) elevation + high release flick
    const w = anim.shootWindup;
    if (w < 0.35) {
      const dip = w / 0.35;
      pelvisY = THREE.MathUtils.lerp(0.96, 0.84, dip);
      torsoLeanX = 0.18 * dip;
      lHipX = -0.42 * dip;
      rHipX = -0.38 * dip;
      lKneeX = 0.78 * dip;
      rKneeX = 0.72 * dip;
      rShX = THREE.MathUtils.lerp(-0.95, -1.35, dip);
      lShX = THREE.MathUtils.lerp(-0.95, -1.35, dip);
      rElbX = -1.45;
      lElbX = -1.35;
    } else {
      const rel = (w - 0.35) / 0.65;
      pelvisY = THREE.MathUtils.lerp(0.84, 0.98, rel);
      torsoLeanX = THREE.MathUtils.lerp(0.12, -0.07, rel);
      lHipX = THREE.MathUtils.lerp(-0.4, -0.15, rel);
      rHipX = THREE.MathUtils.lerp(-0.35, -0.1, rel);
      lKneeX = THREE.MathUtils.lerp(0.7, 0.22, rel);
      rKneeX = THREE.MathUtils.lerp(0.65, 0.18, rel);
      rShX = THREE.MathUtils.lerp(-1.35, -2.58, rel);
      rElbX = THREE.MathUtils.lerp(-1.45, -0.12, rel);
      lShX = THREE.MathUtils.lerp(-1.35, -2.1, rel);
      lShZ = THREE.MathUtils.lerp(-0.18, -0.45, rel); // guide hand separates cleanly
      lElbX = -0.6;
      lAnkleX = 0.28 * rel;
      rAnkleX = 0.28 * rel;
    }
  } else if (anim.isCrossover) {
    // Low explosive hesitation + crossover whip
    const cp = anim.crossoverProgress;
    const wave = Math.sin(cp * Math.PI);
    pelvisY = 0.83;
    pelvisRoll = (cp < 0.5 ? 1 : -1) * 0.16 * wave;
    torsoLeanX = 0.32;
    torsoYaw = (cp < 0.5 ? -1 : 1) * 0.42 * wave;
    lHipX = -0.55;
    rHipX = -0.48;
    lKneeX = 0.95;
    rKneeX = 0.85;
    rShX = -0.95;
    rShZ = 0.48 - wave * 0.65;
    rElbX = -0.95;
    lShX = -0.85;
    lShZ = -0.48;
    lElbX = -0.85;
  } else if (anim.isBlocking) {
    pelvisY = 0.96;
    rShX = -2.72;
    lShX = -2.52;
    lElbX = -0.15;
    rElbX = -0.15;
    lKneeX = 0.22;
    rKneeX = 0.22;
    lAnkleX = 0.3;
    rAnkleX = 0.3;
  } else if (anim.verticalY > 0.15) {
    // Airborne rebound / jump hang
    lHipX = -0.38;
    rHipX = -0.28;
    lKneeX = 0.68;
    rKneeX = 0.52;
    lAnkleX = 0.25;
    rAnkleX = 0.22;
    rShX = -1.55;
    lShX = -1.35;
  } else if (anim.isDefending) {
    // Active low defensive crouch shuffle
    const shuffle = Math.sin(anim.stridePhase) * 0.44 * moveFactor;
    pelvisY = 0.84 + Math.abs(Math.sin(anim.stridePhase)) * 0.025;
    pelvisRoll = Math.cos(anim.stridePhase) * 0.05 * moveFactor;
    torsoLeanX = 0.28;
    lHipX = -0.52 + shuffle;
    rHipX = -0.52 - shuffle;
    lKneeX = 0.88;
    rKneeX = 0.88;
    lAnkleX = -0.25;
    rAnkleX = -0.25;
    lShX = -1.12;
    lShZ = -0.78;
    rShX = -1.12;
    rShZ = 0.78;
    lElbX = -0.58;
    rElbX = -0.58;
  } else if (moveFactor > 0.08) {
    // Biomechanical athletic run/sprint cycle synced to stride phase
    const s = Math.sin(anim.stridePhase);
    const c = Math.cos(anim.stridePhase);
    const doubleBob = Math.abs(s) * 0.045 * moveFactor;

    pelvisY = 0.94 - 0.03 * moveFactor + doubleBob;
    pelvisYaw = s * 0.14 * moveFactor;
    pelvisRoll = c * 0.055 * moveFactor;
    torsoYaw = -s * 0.18 * moveFactor;
    torsoLeanX = 0.24 * moveFactor;

    // Asymmetric thigh drive & knee flexion (push-off vs swing-through)
    lHipX = s * 0.86 * moveFactor - 0.12 * moveFactor;
    rHipX = -s * 0.86 * moveFactor - 0.12 * moveFactor;
    lKneeX = Math.max(0.08, -s * 1.05 * moveFactor) + 0.18 * moveFactor;
    rKneeX = Math.max(0.08, s * 1.05 * moveFactor) + 0.18 * moveFactor;

    // Heel-strike / toe-off ankle articulation
    lAnkleX = s > 0 ? -0.26 * s * moveFactor : 0.34 * -s * moveFactor;
    rAnkleX = -s > 0 ? 0.26 * s * moveFactor : 0.34 * s * moveFactor;

    // Arm swing & active dribble / guard off-arm
    lShX = -s * 0.72 * moveFactor;
    lElbX = -0.65 - 0.42 * moveFactor;
    lShZ = -0.24 - 0.12 * moveFactor;

    if (anim.hasBall && anim.isDribbling) {
      const dribblePump = Math.sin(anim.dribbleCycle * Math.PI * 2) * 0.48;
      rShX = -0.68 + dribblePump * 0.42;
      rElbX = -0.92 - dribblePump * 0.58;
      rShZ = 0.34;
      // Off-arm guards defender
      lShX = -0.78;
      lShZ = -0.52;
      lElbX = -0.95;
    } else {
      rShX = s * 0.72 * moveFactor;
      rElbX = -0.65 - 0.42 * moveFactor;
      rShZ = 0.24 + 0.12 * moveFactor;
    }
  } else {
    // Natural Triple-Threat / Athletic Ready Idle (subtle weight shift & breathing)
    const breathe = Math.sin(elapsed * 2.4) * 0.015;
    pelvisY = 0.93 + breathe * 0.4;
    torsoLeanX = 0.12 + breathe;
    lHipX = -0.18;
    rHipX = -0.12;
    lKneeX = 0.32;
    rKneeX = 0.24;
    lAnkleX = -0.12;
    rAnkleX = -0.1;

    if (anim.hasBall && anim.isDribbling) {
      const dribblePump = Math.sin(anim.dribbleCycle * Math.PI * 2) * 0.42;
      rShX = -0.62 + dribblePump * 0.38;
      rElbX = -0.95 - dribblePump * 0.52;
      rShZ = 0.32;
      lShX = -0.68;
      lShZ = -0.44;
      lElbX = -0.92;
    } else {
      lShX = -0.22;
      rShX = -0.22;
      lElbX = -0.48;
      rElbX = -0.48;
    }
  }

  // Smoothly interpolate all joints
  rig.pelvisGroup.position.y = THREE.MathUtils.lerp(rig.pelvisGroup.position.y, pelvisY, k);
  rig.pelvisGroup.rotation.x = THREE.MathUtils.lerp(rig.pelvisGroup.rotation.x, pelvisX, k);
  rig.pelvisGroup.rotation.y = THREE.MathUtils.lerp(rig.pelvisGroup.rotation.y, pelvisYaw, k);
  rig.pelvisGroup.rotation.z = THREE.MathUtils.lerp(rig.pelvisGroup.rotation.z, pelvisRoll, k);

  rig.upperTorsoGroup.rotation.x = THREE.MathUtils.lerp(rig.upperTorsoGroup.rotation.x, torsoLeanX, k);
  rig.upperTorsoGroup.rotation.y = THREE.MathUtils.lerp(rig.upperTorsoGroup.rotation.y, torsoYaw, k);

  // Head gaze tracking (counter-balances torso lean + looks toward play)
  rig.headGroup.rotation.x = THREE.MathUtils.lerp(rig.headGroup.rotation.x, -torsoLeanX * 0.65, k);
  rig.headGroup.rotation.y = THREE.MathUtils.lerp(
    rig.headGroup.rotation.y,
    THREE.MathUtils.clamp(anim.lookYaw, -0.55, 0.55) - torsoYaw * 0.6,
    k
  );

  rig.leftHip.rotation.x = THREE.MathUtils.lerp(rig.leftHip.rotation.x, lHipX, k);
  rig.rightHip.rotation.x = THREE.MathUtils.lerp(rig.rightHip.rotation.x, rHipX, k);
  rig.leftKnee.rotation.x = THREE.MathUtils.lerp(rig.leftKnee.rotation.x, lKneeX, k);
  rig.rightKnee.rotation.x = THREE.MathUtils.lerp(rig.rightKnee.rotation.x, rKneeX, k);
  rig.leftAnkle.rotation.x = THREE.MathUtils.lerp(rig.leftAnkle.rotation.x, lAnkleX, k);
  rig.rightAnkle.rotation.x = THREE.MathUtils.lerp(rig.rightAnkle.rotation.x, rAnkleX, k);

  rig.leftShoulder.rotation.x = THREE.MathUtils.lerp(rig.leftShoulder.rotation.x, lShX, k);
  rig.leftShoulder.rotation.z = THREE.MathUtils.lerp(rig.leftShoulder.rotation.z, lShZ, k);
  rig.leftElbow.rotation.x = THREE.MathUtils.lerp(rig.leftElbow.rotation.x, lElbX, k);

  rig.rightShoulder.rotation.x = THREE.MathUtils.lerp(rig.rightShoulder.rotation.x, rShX, k);
  rig.rightShoulder.rotation.z = THREE.MathUtils.lerp(rig.rightShoulder.rotation.z, rShZ, k);
  rig.rightElbow.rotation.x = THREE.MathUtils.lerp(rig.rightElbow.rotation.x, rElbX, k);

  // Dynamic cloth physics simulation for jersey & basketball shorts (reacts to running, cutting, & jumping)
  stepGarmentCloth(
    rig.jerseyCloth,
    {
      localVelX: anim.localVelX,
      localVelZ: anim.localVelZ,
      worldVelY: anim.worldVelY,
      localAccelX: anim.localAccelX,
      localAccelY: anim.localAccelY,
      localAccelZ: anim.localAccelZ,
      angularVelY: anim.angularVelY,
      stridePhase: anim.stridePhase,
      elapsed,
    },
    dt
  );
  syncClothGeometry(rig.jerseyCloth, rig.torso.geometry);

  stepGarmentCloth(
    rig.leftShortsCloth,
    {
      localVelX: anim.localVelX,
      localVelZ: anim.localVelZ,
      worldVelY: anim.worldVelY,
      localAccelX: anim.localAccelX,
      localAccelY: anim.localAccelY,
      localAccelZ: anim.localAccelZ,
      angularVelY: anim.angularVelY,
      hipPitchX: rig.leftHip.rotation.x,
      stridePhase: anim.stridePhase,
      elapsed,
    },
    dt
  );
  syncClothGeometry(rig.leftShortsCloth, rig.leftShortsMesh.geometry);

  stepGarmentCloth(
    rig.rightShortsCloth,
    {
      localVelX: anim.localVelX,
      localVelZ: anim.localVelZ,
      worldVelY: anim.worldVelY,
      localAccelX: anim.localAccelX,
      localAccelY: anim.localAccelY,
      localAccelZ: anim.localAccelZ,
      angularVelY: anim.angularVelY,
      hipPitchX: rig.rightHip.rotation.x,
      stridePhase: anim.stridePhase,
      elapsed,
    },
    dt
  );
  syncClothGeometry(rig.rightShortsCloth, rig.rightShortsMesh.geometry);

  // Project grounded foot shadows in root-local XZ coordinates
  rig.root.updateMatrixWorld();
  _rootWorld.setFromMatrixPosition(rig.root.matrixWorld);

  const syncFootShadow = (ankle: THREE.Group, shadowMesh: THREE.Mesh) => {
    _footWorld.setFromMatrixPosition(ankle.matrixWorld);
    const localX = _footWorld.x - _rootWorld.x;
    const localZ = _footWorld.z - _rootWorld.z;
    const cos = Math.cos(-rig.root.rotation.y);
    const sin = Math.sin(-rig.root.rotation.y);
    shadowMesh.position.x = localX * cos - localZ * sin;
    shadowMesh.position.z = localX * sin + localZ * cos;
    const h = Math.max(0, _footWorld.y - _rootWorld.y - 0.04);
    const op = THREE.MathUtils.clamp(0.58 - h * 0.55, 0.08, 0.58);
    const sc = THREE.MathUtils.clamp(1.0 - h * 0.35, 0.55, 1.0);
    (shadowMesh.material as THREE.MeshBasicMaterial).opacity = op;
    shadowMesh.scale.set(sc, sc, 1);
  };
  syncFootShadow(rig.leftAnkle, rig.leftFootShadow);
  syncFootShadow(rig.rightAnkle, rig.rightFootShadow);
}

/**
 * Builds an articulated NBA-style Court Referee rig (striped officiating shirt, tailored trousers,
 * silver whistle lanyard, and expressive arm signal joints).
 */
export function buildRefereeRig(shadowTexture: THREE.Texture): RefereeRig {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: '#C78E6A', roughness: 0.5, metalness: 0.03 });
  const faceTex = createFaceTexture('#C78E6A', '#2D241E', 'stubble', '#241A14', true);
  const headMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.48, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({
    map: createRefereeTexture(),
    roughness: 0.78,
    metalness: 0.04,
  });
  const trouserMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.82, metalness: 0.03 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#09090B', roughness: 0.35, metalness: 0.1 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#27201B', roughness: 0.9 });
  const whistleMat = new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.18, metalness: 0.9 });

  const contactShadow = new THREE.Mesh(
    sharedShadowGeo,
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.44, depthWrite: false })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.014;
  root.add(contactShadow);

  const makeFootShadow = () => {
    const m = new THREE.Mesh(
      sharedFootShadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.52, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.017;
    root.add(m);
    return m;
  };
  const leftFootShadow = makeFootShadow();
  const rightFootShadow = makeFootShadow();

  const bodyGroup = new THREE.Group();
  bodyGroup.scale.set(0.95, 0.96, 0.95);
  root.add(bodyGroup);

  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.96, 0);
  bodyGroup.add(pelvisGroup);

  const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.195, 0.24, 14), trouserMat);
  pelvisMesh.scale.set(1.08, 1, 0.85);
  pelvisMesh.castShadow = true;
  pelvisGroup.add(pelvisMesh);

  const upperTorsoGroup = new THREE.Group();
  upperTorsoGroup.position.set(0, 0.13, 0);
  pelvisGroup.add(upperTorsoGroup);

  const torso = new THREE.Mesh(sharedTorsoGeo, shirtMat);
  torso.scale.set(1.08, 1.0, 0.82);
  torso.position.y = 0.27;
  torso.castShadow = true;
  upperTorsoGroup.add(torso);

  // Whistle & Lanyard on chest
  const whistle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.04, 8), whistleMat);
  whistle.rotation.z = Math.PI / 2;
  whistle.position.set(0, 0.36, 0.195);
  upperTorsoGroup.add(whistle);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.12, 10), skinMat);
  neck.position.set(0, 0.58, 0.005);
  upperTorsoGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.72, 0.015);
  upperTorsoGroup.add(headGroup);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.114, 18, 16), headMat);
  cranium.scale.set(0.94, 1.08, 0.92);
  cranium.rotation.y = -Math.PI / 2;
  cranium.castShadow = true;
  headGroup.add(cranium);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.04, 0.028), skinMat);
  nose.position.set(0, -0.014, 0.102);
  nose.rotation.x = -0.2;
  headGroup.add(nose);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.116, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
    hairMat
  );
  hairCap.position.set(0, 0.022, -0.012);
  hairCap.rotation.x = -0.24;
  headGroup.add(hairCap);

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.245, 0.48, 0);
    upperTorsoGroup.add(shoulder);

    const sleeveCap = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), shirtMat);
    shoulder.add(sleeveCap);

    const upperArm = new THREE.Mesh(sharedUpperArmGeo, skinMat);
    upperArm.position.y = -0.14;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(sharedForearmGeo, skinMat);
    forearm.position.y = -0.13;
    forearm.castShadow = true;
    elbow.add(forearm);

    const hand = buildSculptedHand(skinMat);
    hand.position.y = -0.29;
    elbow.add(hand);

    return { shoulder, elbow };
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, -0.07, 0);
    pelvisGroup.add(hip);

    const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.074, 0.42, 12), trouserMat);
    upperLeg.position.y = -0.21;
    upperLeg.castShadow = true;
    hip.add(upperLeg);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);

    const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.056, 0.36, 12), trouserMat);
    lowerLeg.position.y = -0.18;
    lowerLeg.castShadow = true;
    knee.add(lowerLeg);

    const ankle = new THREE.Group();
    ankle.position.y = -0.37;
    knee.add(ankle);

    const shoe = buildRealisticSneaker(shoeMat, shoeMat, trouserMat);
    ankle.add(shoe);

    return { hip, knee, ankle };
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  return {
    root,
    bodyGroup,
    pelvisGroup,
    upperTorsoGroup,
    headGroup,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    leftAnkle: leftLeg.ankle,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightAnkle: rightLeg.ankle,
    contactShadow,
    leftFootShadow,
    rightFootShadow,
  };
}

/**
 * Animates the referee jogging along sidelines and performing live NBA officiating arm signals.
 */
export function animateRefereeRig(
  rig: RefereeRig,
  speed: number,
  stridePhase: number,
  signal: RefereeSignal,
  dt: number,
  elapsed: number
) {
  const k = 1 - Math.exp(-14 * dt);
  const moveFactor = Math.min(1, speed / 4.8);
  const s = Math.sin(stridePhase);

  const pelvisY = moveFactor > 0.08 ? 0.94 + Math.abs(s) * 0.03 * moveFactor : 0.95 + Math.sin(elapsed * 2) * 0.008;
  rig.pelvisGroup.position.y = THREE.MathUtils.lerp(rig.pelvisGroup.position.y, pelvisY, k);
  rig.pelvisGroup.rotation.y = THREE.MathUtils.lerp(rig.pelvisGroup.rotation.y, s * 0.08 * moveFactor, k);
  rig.upperTorsoGroup.rotation.x = THREE.MathUtils.lerp(rig.upperTorsoGroup.rotation.x, 0.1 * moveFactor, k);
  rig.upperTorsoGroup.rotation.y = THREE.MathUtils.lerp(rig.upperTorsoGroup.rotation.y, -s * 0.1 * moveFactor, k);

  const lHipX = s * 0.58 * moveFactor;
  const rHipX = -s * 0.58 * moveFactor;
  const lKneeX = Math.max(0.06, -s * 0.72 * moveFactor) + 0.12 * moveFactor;
  const rKneeX = Math.max(0.06, s * 0.72 * moveFactor) + 0.12 * moveFactor;

  rig.leftHip.rotation.x = THREE.MathUtils.lerp(rig.leftHip.rotation.x, lHipX, k);
  rig.rightHip.rotation.x = THREE.MathUtils.lerp(rig.rightHip.rotation.x, rHipX, k);
  rig.leftKnee.rotation.x = THREE.MathUtils.lerp(rig.leftKnee.rotation.x, lKneeX, k);
  rig.rightKnee.rotation.x = THREE.MathUtils.lerp(rig.rightKnee.rotation.x, rKneeX, k);
  rig.leftAnkle.rotation.x = THREE.MathUtils.lerp(rig.leftAnkle.rotation.x, -lHipX * 0.35, k);
  rig.rightAnkle.rotation.x = THREE.MathUtils.lerp(rig.rightAnkle.rotation.x, -rHipX * 0.35, k);

  let lShX = -s * 0.45 * moveFactor;
  let rShX = s * 0.45 * moveFactor;
  let lElbX = -0.5;
  let rElbX = -0.5;

  if (signal === 'three_attempt') {
    rShX = -2.95;
    rElbX = -0.08;
  } else if (signal === 'three_good') {
    lShX = -3.0;
    rShX = -3.0;
    lElbX = -0.08;
    rElbX = -0.08;
  } else if (signal === 'two_good') {
    rShX = -1.65;
    rElbX = -0.15;
  } else if (signal === 'whistle_stop') {
    rShX = -2.85;
    rElbX = -0.1;
    lShX = -1.35;
    lElbX = -1.45; // other hand to whistle at mouth
  }

  rig.leftShoulder.rotation.x = THREE.MathUtils.lerp(rig.leftShoulder.rotation.x, lShX, k);
  rig.rightShoulder.rotation.x = THREE.MathUtils.lerp(rig.rightShoulder.rotation.x, rShX, k);
  rig.leftElbow.rotation.x = THREE.MathUtils.lerp(rig.leftElbow.rotation.x, lElbX, k);
  rig.rightElbow.rotation.x = THREE.MathUtils.lerp(rig.rightElbow.rotation.x, rElbX, k);

  rig.root.updateMatrixWorld();
  _rootWorld.setFromMatrixPosition(rig.root.matrixWorld);
  [
    [rig.leftAnkle, rig.leftFootShadow] as const,
    [rig.rightAnkle, rig.rightFootShadow] as const,
  ].forEach(([ankle, sh]) => {
    _footWorld.setFromMatrixPosition(ankle.matrixWorld);
    const lx = _footWorld.x - _rootWorld.x;
    const lz = _footWorld.z - _rootWorld.z;
    const cos = Math.cos(-rig.root.rotation.y);
    const sin = Math.sin(-rig.root.rotation.y);
    sh.position.x = lx * cos - lz * sin;
    sh.position.z = lx * sin + lz * cos;
  });
}
