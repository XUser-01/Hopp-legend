import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import {
  BallSimState,
  COURT_DIMS,
  canTriggerDunk,
  computeShotVelocity,
  evaluateShotRelease,
  getShotPointValue,
  stepBallPhysics,
} from './physics';
import {
  animatePlayerRig,
  animateRefereeRig,
  buildPlayerRig,
  buildRefereeRig,
  PlayerRig,
  RefereeRig,
  RefereeSignal,
} from './playerMesh';
import {
  createBasketballTextures,
  createContactShadowTexture,
  createCourtTextures,
  createJumbotronTexture,
  createScorersTableTexture,
} from './textures';
import {
  ArenaTheme,
  HudSnapshot,
  MatchBoxScore,
  MatchConfig,
  PlayerCard,
} from './types';

export interface VirtualInputState {
  moveX: number; // -1..1
  moveZ: number; // -1..1
  sprint: boolean;
  shootHeld: boolean;
}

interface ActorState {
  id: string;
  card: PlayerCard;
  team: 'player' | 'opponent';
  rig: PlayerRig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  prevVel: THREE.Vector3;
  facingYaw: number;
  verticalY: number;
  verticalVel: number;
  prevVerticalVel: number;
  stridePhase: number;
  dribbleCycle: number;
  stamina: number;
  isShooting: boolean;
  shootTimer: number;
  isDunking: boolean;
  dunkTimer: number;
  dunkStartPos: THREE.Vector3;
  dunkTargetPos: THREE.Vector3;
  isBlocking: boolean;
  blockTimer: number;
  isDefending: boolean;
  stunTimer: number;
  crossoverCooldown: number;
  crossoverTimer: number;
  turnBank: number;
  lookYaw: number;
  angularVelY: number;
  localAccelX: number;
  localAccelY: number;
  localAccelZ: number;
  squashY: number;
  aiRole: 'on_ball' | 'rim_protector' | 'wing_spacer';
  aiDecisionTimer: number;
  aiShotCharge: number;
  aiChargingShot: boolean;
}

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  color: THREE.Color;
}

interface HoopRig {
  group: THREE.Group;
  rimPivot: THREE.Group;
  netMesh: THREE.Mesh;
  rimFlex: number;
  rimFlexVel: number;
  netRipple: number;
}

// Pre-allocated scratch math objects (zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _euler = new THREE.Euler();

export interface ArenaCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchEnd: (boxScore: MatchBoxScore) => void;
  onPauseRequested: () => void;
}

export class ArenaEngine {
  private container: HTMLElement;
  private callbacks: ArenaCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;

  private shadowTex: THREE.Texture;
  private courtMesh: THREE.Mesh;
  private courtMat: THREE.MeshStandardMaterial;
  private ballMesh: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private hoops: { player: HoopRig; opponent: HoopRig };
  private arenaPropsGroup = new THREE.Group();
  private crowdInstanced: THREE.InstancedMesh | null = null;
  private crowdHeadInstanced: THREE.InstancedMesh | null = null;
  private crowdBaseMatrices: THREE.Matrix4[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  private refereeRig: RefereeRig;
  private refereePos = new THREE.Vector3(-7.0, 0, -2.5);
  private refereeVel = new THREE.Vector3();
  private refereeYaw = Math.PI * 0.5;
  private refereeStride = 0;
  private refereeSignal: RefereeSignal = 'none';
  private refereeSignalTimer = 0;

  private dirLight: THREE.DirectionalLight;
  private rimDirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimSpotlights: THREE.PointLight[] = [];

  private currentTheme: ArenaTheme = 'pro';
  private phase: 'title' | 'playing' | 'paused' | 'gameover' = 'title';
  private cameraMode: 0 | 1 | 2 = 0; // 0: 2K Broadcast Behind, 1: Side Broadcast, 2: Court Side Low
  private camPos = new THREE.Vector3(0, 8, 15);
  private camLook = new THREE.Vector3(0, 1.5, 0);
  private trauma = 0;
  private hitstopTimer = 0;
  private crowdExcitement = 0;

  // Match & physics state
  private matchConfig: MatchConfig = {
    mode: '1v1',
    durationSec: 180,
    ruleset: 'classic',
    arena: 'pro',
    targetScore: 21,
    shotAssist: true,
  };
  private actors: ActorState[] = [];
  private controlledActorIdx = 0;
  private ballOwnerIdx: number | null = 0;
  private ballState: BallSimState = {
    pos: { x: 0, y: 1.1, z: 0 },
    lastPos: { x: 0, y: 1.1, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    inFlight: false,
    shotByTeam: null,
    shotValue: 2,
    hasScoredThisFlight: false,
  };

  private playerScore = 0;
  private opponentScore = 0;
  private timeRemaining = 180;
  private shotClock = 24;
  private possession: 'player' | 'opponent' | 'loose' = 'player';
  private inboundDelay = 0;
  private lastShotClockBeep = 0;
  private hotStreak = 0;
  private feedbackIdCounter = 1;
  private activeFeedback: HudSnapshot['shotFeedback'] = null;
  private feedbackTimer = 0;

  // Box score trackers
  private stats = {
    pointsScored: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    dunks: 0,
    blocks: 0,
    steals: 0,
    assists: 0,
    rebounds: 0,
    perfectReleases: 0,
  };
  private lastPasserIdx: number | null = null;
  private assistWindowTimer = 0;

  // Tutorial progression
  private tutorialStep = 0; // 0: move/dribble, 1: crossover, 2: shoot/score, 3: dunk, 4: defense

  // Input state
  private keys = new Set<string>();
  private virtualInput: VirtualInputState = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    shootHeld: false,
  };
  private shootChargeActive = false;
  private shootChargeRatio = 0;
  private shootSweetSpot = 0.72;
  private hudEmitAccum = 0;
  private lastTimestamp = 0;
  private elapsed = 0;

  constructor(
    container: HTMLElement,
    initialStarters: PlayerCard[],
    initialTheme: ArenaTheme,
    callbacks: ArenaCallbacks
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentTheme = initialTheme;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.2, 220);
    this.camera.position.copy(this.camPos);

    // Mandatory studio environment map for PBR specular highlights
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm key + cool hemisphere fill + crisp athletic rim backlight
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x292524, 0.72);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff1dc, 1.95);
    this.dirLight.position.set(8, 19, 9);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 52;
    const d = 15;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.radius = 2.5;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);

    this.rimDirLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
    this.rimDirLight.position.set(-9, 12, -13);
    this.scene.add(this.rimDirLight);

    // Two unshadowed hoop floodlights
    const spot1 = new THREE.PointLight(0xffedd5, 18, 22, 1.5);
    spot1.position.set(0, 7.6, COURT_DIMS.playerHoopZ);
    const spot2 = new THREE.PointLight(0xffedd5, 18, 22, 1.5);
    spot2.position.set(0, 7.6, COURT_DIMS.opponentHoopZ);
    this.scene.add(spot1, spot2);
    this.rimSpotlights.push(spot1, spot2);

    this.shadowTex = createContactShadowTexture();

    // Court floor mesh with albedo + gloss roughnessMap + plank bevel bumpMap
    const courtGeo = new THREE.PlaneGeometry(COURT_DIMS.halfWidth * 2 + 2.4, COURT_DIMS.halfLength * 2 + 2.4);
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const { colorMap, roughnessMap, bumpMap } = createCourtTextures(this.currentTheme, maxAniso);
    this.courtMat = new THREE.MeshStandardMaterial({
      map: colorMap,
      roughnessMap,
      bumpMap,
      bumpScale: 0.008,
      roughness: 0.56,
      metalness: 0.06,
      envMapIntensity: 1.15,
      color: 0xffffff,
    });
    this.courtMesh = new THREE.Mesh(courtGeo, this.courtMat);
    this.courtMesh.rotation.x = -Math.PI / 2;
    this.courtMesh.receiveShadow = true;
    this.scene.add(this.courtMesh);

    // Official Court Referee (always present on court)
    this.refereeRig = buildRefereeRig(this.shadowTex);
    this.refereeRig.root.position.copy(this.refereePos);
    this.scene.add(this.refereeRig.root);

    // Basketball mesh + ground contact shadow
    const ballTex = createBasketballTextures();
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(COURT_DIMS.ballRadius, 24, 24),
      new THREE.MeshStandardMaterial({
        map: ballTex.map,
        bumpMap: ballTex.bumpMap,
        bumpScale: 0.015,
        roughness: 0.46,
        metalness: 0.04,
      })
    );
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 16),
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.016;
    this.scene.add(this.ballShadow);

    // Hoops at both ends
    this.hoops = {
      player: this.buildHoopRig(COURT_DIMS.playerHoopZ, 1),
      opponent: this.buildHoopRig(COURT_DIMS.opponentHoopZ, -1),
    };
    this.scene.add(this.hoops.player.group, this.hoops.opponent.group);

    // Pooled InstancedMesh particles (90 slots, zero GC)
    const pGeo = new THREE.OctahedronGeometry(0.065, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, 90);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 0.5,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 0,
        color: new THREE.Color(0xf59e0b),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, new THREE.Color(0xf59e0b));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    this.scene.add(this.arenaPropsGroup);
    this.applyArenaTheme(this.currentTheme);

    // Populate initial showcase scrimmage actors for live Title background
    this.spawnShowcaseActors(initialStarters);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.lastTimestamp = performance.now();
    this.scheduleNextTick();
  }

  private buildHoopRig(hoopZ: number, facingDir: 1 | -1): HoopRig {
    const group = new THREE.Group();
    const sign = -facingDir; // stanchion sits behind the hoop away from court center
    const baseZ = hoopZ + sign * 1.45;

    const steelMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.35, metalness: 0.78 });
    const padMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.72, metalness: 0.08 });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#EA580C', roughness: 0.28, metalness: 0.65 });
    const boardMat = new THREE.MeshPhysicalMaterial({
      color: '#E2E8F0',
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 1.0,
      transmission: this.isSoftwareGl ? 0 : 0.72,
      transparent: true,
      opacity: this.isSoftwareGl ? 0.36 : 0.92,
      depthWrite: false,
    });
    const whiteTrimMat = new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.4 });
    const clockMat = new THREE.MeshStandardMaterial({
      color: '#111827',
      emissive: '#DC2626',
      emissiveIntensity: 0.45,
      roughness: 0.5,
    });

    // 1. Padded Floor Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 1.1), padMat);
    base.position.set(0, 0.425, baseZ);
    base.castShadow = true;
    group.add(base);

    // 2. Vertical Hydraulic Mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.7, 12), steelMat);
    mast.position.set(0, 2.1, baseZ);
    mast.castShadow = true;
    group.add(mast);

    // 3. Cantilever Extension Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 1.3), steelMat);
    arm.position.set(0, 3.35, hoopZ + sign * 0.82);
    arm.castShadow = true;
    group.add(arm);

    // 4. Tempered Glass Backboard
    const boardZ = hoopZ + sign * COURT_DIMS.backboardOffsetZ;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.82, 1.08, 0.045), boardMat);
    board.position.set(0, COURT_DIMS.hoopY + 0.36, boardZ);
    board.renderOrder = 5;
    group.add(board);

    // 5. Backboard Frame & Shooter's Square
    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.07, 0.07), padMat);
    frameBottom.position.set(0, COURT_DIMS.hoopY - 0.18, boardZ);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.04, 0.06), whiteTrimMat);
    frameTop.position.set(0, COURT_DIMS.hoopY + 0.9, boardZ);
    const shooterSquare = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.25, 4), whiteTrimMat);
    shooterSquare.rotation.z = Math.PI / 4;
    shooterSquare.position.set(0, COURT_DIMS.hoopY + 0.24, boardZ - sign * 0.026);
    group.add(frameBottom, frameTop, shooterSquare);

    // 6. Shot Clock Housing
    const shotClockBox = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.32, 0.18), clockMat);
    shotClockBox.position.set(0, COURT_DIMS.hoopY + 1.12, boardZ);
    group.add(shotClockBox);

    // 7. Breakaway Rim Pivot + Torus + Animated Net
    const rimPivot = new THREE.Group();
    rimPivot.position.set(0, COURT_DIMS.hoopY, boardZ - sign * 0.04);
    group.add(rimPivot);

    const rimOffsetZ = -sign * (COURT_DIMS.backboardOffsetZ - 0.04);
    const rimTorus = new THREE.Mesh(new THREE.TorusGeometry(COURT_DIMS.hoopRadius, 0.022, 10, 28), rimMat);
    rimTorus.rotation.x = Math.PI / 2;
    rimTorus.position.set(0, 0, rimOffsetZ);
    rimTorus.castShadow = true;
    rimPivot.add(rimTorus);

    const neckMount = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.16), rimMat);
    neckMount.position.set(0, -0.01, rimOffsetZ * 0.45);
    rimPivot.add(neckMount);

    // Tapered nylon net
    const netGeo = new THREE.CylinderGeometry(COURT_DIMS.hoopRadius * 0.95, 0.13, 0.42, 14, 4, true);
    const netMat = new THREE.MeshStandardMaterial({
      color: '#F8FAFC',
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      roughness: 0.8,
    });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, -0.22, rimOffsetZ);
    rimPivot.add(netMesh);

    return {
      group,
      rimPivot,
      netMesh,
      rimFlex: 0,
      rimFlexVel: 0,
      netRipple: 0,
    };
  }

  public applyArenaTheme(theme: ArenaTheme) {
    this.currentTheme = theme;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const { colorMap, roughnessMap, bumpMap } = createCourtTextures(theme, maxAniso);
    this.courtMat.map?.dispose();
    this.courtMat.roughnessMap?.dispose();
    this.courtMat.bumpMap?.dispose();
    this.courtMat.map = colorMap;
    this.courtMat.roughnessMap = roughnessMap;
    this.courtMat.bumpMap = bumpMap;
    this.courtMat.bumpScale = theme === 'pro' ? 0.008 : 0.014;
    this.courtMat.roughness = theme === 'pro' ? 0.56 : theme === 'venice' ? 0.92 : 0.72;
    this.courtMat.needsUpdate = true;

    // Clear old arena props cleanly
    while (this.arenaPropsGroup.children.length > 0) {
      const child = this.arenaPropsGroup.children.pop()!;
      this.arenaPropsGroup.remove(child);
    }
    this.crowdInstanced = null;
    this.crowdHeadInstanced = null;
    this.crowdBaseMatrices = [];

    if (theme === 'pro') {
      const bg = new THREE.Color('#090C14');
      this.scene.background = bg;
      this.scene.fog = new THREE.FogExp2('#090C14', 0.018);
      this.hemiLight.color.set('#93C5FD');
      this.hemiLight.groundColor.set('#27201A');
      this.dirLight.color.set('#FFF2DD');
      this.dirLight.intensity = 1.95;
      this.buildProStadiumProps();
    } else if (theme === 'venice') {
      const bg = new THREE.Color('#F59E72');
      this.scene.background = bg;
      this.scene.fog = new THREE.FogExp2('#F59E72', 0.014);
      this.hemiLight.color.set('#FED7AA');
      this.hemiLight.groundColor.set('#7C2D12');
      this.dirLight.color.set('#FDBA74');
      this.dirLight.intensity = 2.25;
      this.buildVeniceBeachProps();
    } else {
      const bg = new THREE.Color('#070B19');
      this.scene.background = bg;
      this.scene.fog = new THREE.FogExp2('#070B19', 0.016);
      this.hemiLight.color.set('#60A5FA');
      this.hemiLight.groundColor.set('#1E1B4B');
      this.dirLight.color.set('#E0F2FE');
      this.dirLight.intensity = 1.85;
      this.buildTokyoRooftopProps();
    }
  }

  private buildProStadiumProps() {
    // Extended dark polished arena floor apron
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 96),
      new THREE.MeshStandardMaterial({ color: '#070A11', roughness: 0.55, metalness: 0.18 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.025;
    apron.receiveShadow = true;
    this.arenaPropsGroup.add(apron);

    // Courtside LED ribbon boards with textured broadcast branding
    const ledTex = createScorersTableTexture();
    const ledMat = new THREE.MeshStandardMaterial({
      map: ledTex,
      emissiveMap: ledTex,
      emissive: '#FFFFFF',
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });
    const sideLedLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.76, 22), ledMat);
    sideLedLeft.position.set(-10.2, 0.38, 0);
    const sideLedRight = sideLedLeft.clone();
    sideLedRight.position.x = 10.2;
    const farLed = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.76, 0.28), ledMat);
    farLed.position.set(0, 0.38, -13.1);
    this.arenaPropsGroup.add(sideLedLeft, sideLedRight, farLed);

    // Courtside Scorer's Table & Team Benches
    const tableBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.78, 5.2),
      new THREE.MeshStandardMaterial({ color: '#0B101D', roughness: 0.45, metalness: 0.25 })
    );
    tableBody.position.set(9.15, 0.39, 0);
    tableBody.castShadow = true;
    const tableLed = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 0.65), ledMat);
    tableLed.rotation.y = -Math.PI / 2;
    tableLed.position.set(8.79, 0.4, 0);
    this.arenaPropsGroup.add(tableBody, tableLed);

    // Team benches on opposite sideline (padded seats + seated reserve players)
    const benchMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.65 });
    const seatAccent = new THREE.MeshStandardMaterial({ color: '#F59E0B', roughness: 0.5 });
    [-4.8, 4.8].forEach((bz) => {
      for (let s = -1; s <= 1; s++) {
        const chair = new THREE.Group();
        chair.position.set(-9.15, 0, bz + s * 0.95);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), benchMat);
        seat.position.y = 0.44;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.45), seatAccent);
        back.position.set(-0.2, 0.66, 0);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.38), benchMat);
        leg.position.y = 0.22;
        chair.add(seat, back, leg);
        this.arenaPropsGroup.add(chair);
      }
    });

    // Baseline TV Camera Operators with Tripods
    [-4.8, 4.8].forEach((cx) => {
      const camGroup = new THREE.Group();
      camGroup.position.set(cx, 0, -12.35);
      const tripod = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.95, 3),
        new THREE.MeshStandardMaterial({ color: '#1E293B', metalness: 0.8, roughness: 0.3 })
      );
      tripod.position.y = 0.475;
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.14, 0.42, 12),
        new THREE.MeshStandardMaterial({ color: '#090D16', metalness: 0.7, roughness: 0.25 })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 1.02, 0.12);
      camGroup.add(tripod, lens);
      this.arenaPropsGroup.add(camGroup);
    });

    // Tiered Arena Bowl Bleachers & Upper Dark Wall Enclosure
    const tierMat = new THREE.MeshStandardMaterial({ color: '#0D111A', roughness: 0.88 });
    for (let t = 0; t < 4; t++) {
      const y = 0.7 + t * 0.88;
      const offset = 11.4 + t * 1.35;
      const leftTier = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.88, 28), tierMat);
      leftTier.position.set(-offset, y, 0);
      const rightTier = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.88, 28), tierMat);
      rightTier.position.set(offset, y, 0);
      const farTier = new THREE.Mesh(new THREE.BoxGeometry(24, 0.88, 1.45), tierMat);
      farTier.position.set(0, y, -14.2 - t * 1.35);
      this.arenaPropsGroup.add(leftTier, rightTier, farTier);
    }

    // Upper Concourse Bowl Wall & Luxury Suite Windows (eliminates empty dark void)
    const wallMat = new THREE.MeshStandardMaterial({ color: '#0B101A', roughness: 0.9 });
    const suiteGlassMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      emissive: '#F59E0B',
      emissiveIntensity: 0.14,
      roughness: 0.25,
    });
    const farBowlWall = new THREE.Mesh(new THREE.BoxGeometry(36, 7.5, 0.6), wallMat);
    farBowlWall.position.set(0, 7.4, -19.2);
    const farSuiteStrip = new THREE.Mesh(new THREE.BoxGeometry(28, 1.1, 0.65), suiteGlassMat);
    farSuiteStrip.position.set(0, 6.2, -19.1);
    const leftBowlWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 38), wallMat);
    leftBowlWall.position.set(-16.5, 7.4, -1);
    const rightBowlWall = leftBowlWall.clone();
    rightBowlWall.position.x = 16.5;
    this.arenaPropsGroup.add(farBowlWall, farSuiteStrip, leftBowlWall, rightBowlWall);

    // Two-Part Seated Arena Crowd Silhouettes (Torso + Head for believable realism)
    const torsoGeo = new THREE.CylinderGeometry(0.17, 0.21, 0.46, 8);
    const headGeo = new THREE.SphereGeometry(0.105, 8, 8);
    const fanMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0.02 });
    const positions: THREE.Vector3[] = [];
    for (let t = 0; t < 4; t++) {
      const y = 1.32 + t * 0.88;
      const xOff = 11.35 + t * 1.35;
      for (let z = -11.5; z <= 11.5; z += 0.82) {
        positions.push(new THREE.Vector3(-xOff, y, z));
        positions.push(new THREE.Vector3(xOff, y, z));
      }
      for (let x = -10.2; x <= 10.2; x += 0.86) {
        positions.push(new THREE.Vector3(x, y, -14.15 - t * 1.35));
      }
    }

    const crowd = new THREE.InstancedMesh(torsoGeo, fanMat, positions.length);
    const crowdHeads = new THREE.InstancedMesh(headGeo, fanMat, positions.length);
    const jacketPalette = ['#151B27', '#1E2534', '#262D3D', '#322220', '#1E293B', '#3A2D1E'];
    const skinPalette = ['#7B4B2E', '#D49B72', '#9B6B49', '#E8BFA3', '#643A22'];
    const c = new THREE.Color();
    this.crowdBaseMatrices = [];

    positions.forEach((p, idx) => {
      const s = 0.88 + (idx % 5) * 0.05;
      _scaleVec.set(s * 1.15, s, s * 0.85);
      _quat.identity();
      _mat4.compose(p, _quat, _scaleVec);
      crowd.setMatrixAt(idx, _mat4);
      this.crowdBaseMatrices.push(_mat4.clone());
      c.set(jacketPalette[idx % jacketPalette.length]);
      crowd.setColorAt(idx, c);

      _v1.set(p.x, p.y + 0.34 * s, p.z);
      _scaleVec.set(s, s, s);
      _mat4.compose(_v1, _quat, _scaleVec);
      crowdHeads.setMatrixAt(idx, _mat4);
      c.set(skinPalette[idx % skinPalette.length]);
      crowdHeads.setColorAt(idx, c);
    });
    crowd.instanceMatrix.needsUpdate = true;
    crowdHeads.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    if (crowdHeads.instanceColor) crowdHeads.instanceColor.needsUpdate = true;
    crowd.computeBoundingSphere();
    crowdHeads.computeBoundingSphere();
    this.crowdInstanced = crowd;
    this.crowdHeadInstanced = crowdHeads;
    this.arenaPropsGroup.add(crowd, crowdHeads);

    // Overhead Stadium Truss, Live 4-Sided Jumbotron, Rafters Banners & Spot Beams
    const trussMat = new THREE.MeshStandardMaterial({ color: '#1A202C', metalness: 0.84, roughness: 0.28 });
    const truss = new THREE.Mesh(new THREE.BoxGeometry(20, 0.45, 0.45), trussMat);
    truss.position.set(0, 11.4, -2.5);
    this.arenaPropsGroup.add(truss);

    const jumboTex = createJumbotronTexture();
    const jumboScreenMat = new THREE.MeshStandardMaterial({
      map: jumboTex,
      emissiveMap: jumboTex,
      emissive: '#FFFFFF',
      emissiveIntensity: 0.72,
      roughness: 0.22,
    });
    const jumbotronGroup = new THREE.Group();
    jumbotronGroup.position.set(0, 9.2, -2.5);
    const jumboBody = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 4.4), trussMat);
    const jumboScreenZ = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.55, 4.48), jumboScreenMat);
    const jumboScreenX = new THREE.Mesh(new THREE.BoxGeometry(4.48, 1.55, 3.8), jumboScreenMat);
    jumbotronGroup.add(jumboBody, jumboScreenZ, jumboScreenX);
    this.arenaPropsGroup.add(jumbotronGroup);

    // Hanging Championship Banners in far rafters
    const bannerMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.7 });
    const goldTrimMat = new THREE.MeshStandardMaterial({ color: '#F59E0B', roughness: 0.4 });
    [-6.5, -3.5, 3.5, 6.5].forEach((bx) => {
      const banner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.08), bannerMat);
      banner.position.set(bx, 9.8, -14.5);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.12), goldTrimMat);
      bar.position.set(bx, 10.75, -14.5);
      this.arenaPropsGroup.add(banner, bar);
    });

    const beamMat = new THREE.MeshBasicMaterial({
      color: '#FDE68A',
      transparent: true,
      opacity: 0.028,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    [-5.5, 0, 5.5].forEach((bx) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.8, 11.8, 16, 1, true), beamMat);
      cone.position.set(bx, 5.9, 0);
      this.arenaPropsGroup.add(cone);
    });
  }

  private buildVeniceBeachProps() {
    // Sun-warmed coastal promenade extending to ocean horizon
    const sandGround = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: '#D6B48A', roughness: 0.94, metalness: 0.0 })
    );
    sandGround.rotation.x = -Math.PI / 2;
    sandGround.position.y = -0.025;
    sandGround.receiveShadow = true;
    this.arenaPropsGroup.add(sandGround);

    // Pacific Ocean horizon strip
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 60),
      new THREE.MeshStandardMaterial({ color: '#0E7490', roughness: 0.18, metalness: 0.35 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.01, -46);
    this.arenaPropsGroup.add(ocean);

    // Chain-link court fence posts + top rail
    const postMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.7, roughness: 0.4 });
    const fenceMat = new THREE.MeshBasicMaterial({
      color: '#94A3B8',
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    [-9.8, 9.8].forEach((x) => {
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.8, 24, 4), fenceMat);
      fence.position.set(x, 1.4, 0);
      fence.rotation.y = Math.PI / 2;
      this.arenaPropsGroup.add(fence);
      for (let z = -12; z <= 12; z += 4) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8), postMat);
        post.position.set(x, 1.45, z);
        this.arenaPropsGroup.add(post);
      }
    });

    // Composite Palm Trees outside perimeter
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#78350F', roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#15803D', roughness: 0.75 });
    const palmSpots = [
      [-13, -9],
      [13, -10],
      [-14, 6],
      [14, 7],
      [-10, -17],
      [10, -17],
    ];
    palmSpots.forEach(([px, pz], idx) => {
      const palm = new THREE.Group();
      palm.position.set(px, 0, pz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 6.8 + (idx % 2) * 1.1, 8), trunkMat);
      trunk.position.y = 3.4;
      trunk.rotation.z = (idx % 2 === 0 ? 1 : -1) * 0.08;
      palm.add(trunk);

      const crownY = 6.7 + (idx % 2) * 1.1;
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 5), leafMat);
        const angle = (f / 5) * Math.PI * 2;
        frond.position.set(Math.cos(angle) * 1.1, crownY, Math.sin(angle) * 1.1);
        frond.rotation.z = -Math.PI / 2.5;
        frond.rotation.y = -angle;
        palm.add(frond);
      }
      this.arenaPropsGroup.add(palm);
    });
  }

  private buildTokyoRooftopProps() {
    // Concrete helipad/rooftop deck
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 52),
      new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.85, metalness: 0.1 })
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = -0.025;
    deck.receiveShadow = true;
    this.arenaPropsGroup.add(deck);

    // Illuminated perimeter guard rail
    const railMat = new THREE.MeshStandardMaterial({
      color: '#1E293B',
      emissive: '#38BDF8',
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });
    const backRail = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 0.14), railMat);
    backRail.position.set(0, 0.55, -15.5);
    this.arenaPropsGroup.add(backRail);

    // Surrounding Tokyo skyline towers
    const towerMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.4, metalness: 0.5 });
    const winMat = new THREE.MeshStandardMaterial({
      color: '#BAE6FD',
      emissive: '#38BDF8',
      emissiveIntensity: 0.7,
    });
    const towers = [
      [-18, -26, 7, 28],
      [-8, -32, 6, 36],
      [4, -34, 8, 42],
      [17, -28, 7, 30],
      [-24, -6, 6, 22],
      [24, -4, 6, 26],
    ];
    towers.forEach(([tx, tz, w, h]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
      b.position.set(tx, h * 0.5 - 12, tz);
      this.arenaPropsGroup.add(b);
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.35, w * 0.8), winMat);
      beacon.position.set(tx, h - 12.2, tz);
      this.arenaPropsGroup.add(beacon);
    });
  }

  private spawnShowcaseActors(starters: PlayerCard[]) {
    this.clearActors();
    const p0 = starters[0];
    const p1 = starters[1] ?? starters[0];
    const a0 = this.createActor(p0, 'player', new THREE.Vector3(1.6, 0, -2.5), 'on_ball');
    const a1 = this.createActor(p1, 'opponent', new THREE.Vector3(1.6, 0, -5.8), 'on_ball');
    this.actors.push(a0, a1);
    this.controlledActorIdx = 0;
    this.ballOwnerIdx = 0;
    this.refereePos.set(-6.4, 0, -4.2);
    this.refereeSignal = 'none';
  }

  private clearActors() {
    for (const a of this.actors) {
      this.scene.remove(a.rig.root);
      a.rig.torso.geometry.dispose();
      a.rig.leftShortsMesh.geometry.dispose();
      a.rig.rightShortsMesh.geometry.dispose();
      a.rig.jerseyMaterial.map?.dispose();
      a.rig.jerseyMaterial.dispose();
      a.rig.shortsMaterial.map?.dispose();
      a.rig.shortsMaterial.dispose();
    }
    this.actors = [];
  }

  private createActor(
    card: PlayerCard,
    team: 'player' | 'opponent',
    pos: THREE.Vector3,
    aiRole: ActorState['aiRole'],
    jerseyOverrideColor?: string | null
  ): ActorState {
    const rig = buildPlayerRig(card, this.shadowTex, team, jerseyOverrideColor);
    rig.root.position.copy(pos);
    this.scene.add(rig.root);
    return {
      id: `${team}-${card.id}-${Math.random().toString(36).slice(2, 6)}`,
      card,
      team,
      rig,
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      prevVel: new THREE.Vector3(),
      facingYaw: team === 'player' ? Math.PI : 0,
      verticalY: 0,
      verticalVel: 0,
      prevVerticalVel: 0,
      stridePhase: 0,
      dribbleCycle: 0,
      stamina: 100,
      isShooting: false,
      shootTimer: 0,
      isDunking: false,
      dunkTimer: 0,
      dunkStartPos: new THREE.Vector3(),
      dunkTargetPos: new THREE.Vector3(),
      isBlocking: false,
      blockTimer: 0,
      isDefending: false,
      stunTimer: 0,
      crossoverCooldown: 0,
      crossoverTimer: 0,
      turnBank: 0,
      lookYaw: 0,
      angularVelY: 0,
      localAccelX: 0,
      localAccelY: 0,
      localAccelZ: 0,
      squashY: 1,
      aiRole,
      aiDecisionTimer: 0.4 + Math.random() * 0.6,
      aiShotCharge: 0,
      aiChargingShot: false,
    };
  }

  public startMatch(
    config: MatchConfig,
    playerStarters: PlayerCard[],
    opponentRoster: PlayerCard[],
    jerseyOverrideColor?: string | null
  ) {
    this.matchConfig = { ...config };
    this.applyArenaTheme(config.arena);
    this.clearActors();

    const teamSize = config.mode === '3v3' ? 3 : config.mode === '2v2' ? 2 : 1;
    const pRoles: ActorState['aiRole'][] = ['on_ball', 'wing_spacer', 'rim_protector'];
    const pSpawns = [
      new THREE.Vector3(0, 0, -1.5),
      new THREE.Vector3(-4.2, 0, -4.5),
      new THREE.Vector3(4.2, 0, -4.5),
    ];
    const oSpawns = [
      new THREE.Vector3(0, 0, -4.8),
      new THREE.Vector3(-3.8, 0, -6.5),
      new THREE.Vector3(1.2, 0, -8.0),
    ];

    for (let i = 0; i < teamSize; i++) {
      const pCard = playerStarters[i % playerStarters.length];
      this.actors.push(
        this.createActor(pCard, 'player', pSpawns[i], pRoles[i], jerseyOverrideColor)
      );
    }
    for (let i = 0; i < teamSize; i++) {
      const oCard = opponentRoster[i % opponentRoster.length];
      this.actors.push(
        this.createActor(
          oCard,
          'opponent',
          oSpawns[i],
          i === 0 ? 'on_ball' : i === 1 ? 'rim_protector' : 'wing_spacer'
        )
      );
    }

    this.controlledActorIdx = 0;
    this.ballOwnerIdx = 0;
    this.possession = 'player';
    this.playerScore = 0;
    this.opponentScore = 0;
    this.timeRemaining = config.mode === 'tutorial' ? 90 : config.durationSec;
    this.shotClock = 24;
    this.inboundDelay = 0;
    this.hotStreak = 0;
    this.tutorialStep = 0;
    this.activeFeedback = null;
    this.shootChargeActive = false;
    this.shootChargeRatio = 0;
    this.keys.clear();

    this.stats = {
      pointsScored: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      dunks: 0,
      blocks: 0,
      steals: 0,
      assists: 0,
      rebounds: 0,
      perfectReleases: 0,
    };

    this.phase = 'playing';
    soundEngine.playWhistle();
    this.emitHud();
  }

  public returnToTitle(starters: PlayerCard[]) {
    this.phase = 'title';
    this.keys.clear();
    this.shootChargeActive = false;
    this.spawnShowcaseActors(starters);
  }

  public setPaused(paused: boolean) {
    if (this.phase === 'gameover' || this.phase === 'title') return;
    this.phase = paused ? 'paused' : 'playing';
    if (paused) this.keys.clear();
  }

  public cycleCamera() {
    this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
  }

  public setVirtualInput(partial: Partial<VirtualInputState>) {
    Object.assign(this.virtualInput, partial);
    if (partial.shootHeld === true && !this.shootChargeActive) {
      this.onShootPress();
    } else if (partial.shootHeld === false && this.shootChargeActive) {
      this.onShootRelease();
    }
  }

  public triggerCrossover() {
    if (this.phase !== 'playing') return;
    const actor = this.actors[this.controlledActorIdx];
    if (!actor || actor.crossoverCooldown > 0 || actor.verticalY > 0.05) return;

    actor.crossoverCooldown = 0.72;
    actor.crossoverTimer = 0.38;
    actor.stamina = Math.max(0, actor.stamina - 8);
    soundEngine.playSqueak();

    // Burst sideways/forward + sneaker hardwood dust scuff
    const moveDirX = Math.sin(actor.facingYaw);
    const moveDirZ = Math.cos(actor.facingYaw);
    actor.vel.x += moveDirX * 3.8;
    actor.vel.z += moveDirZ * 3.8;
    this.spawnBurst(actor.pos.x, 0.08, actor.pos.z, '#FDE68A', 8);

    // Ankle-breaker check on closest opponent
    for (const other of this.actors) {
      if (other.team !== actor.team && other.pos.distanceTo(actor.pos) < 2.2) {
        const breakChance = (actor.card.stats.handle - other.card.stats.defense) * 0.012 + 0.35;
        if (Math.random() < breakChance) {
          other.stunTimer = 1.1;
          this.showFeedback('ANKLE BREAKER!', 'dunk');
        }
      }
    }

    if (this.matchConfig.mode === 'tutorial' && this.tutorialStep === 1) {
      this.tutorialStep = 2;
    }
  }

  public triggerPassOrSwitch() {
    if (this.phase !== 'playing') return;
    const controlled = this.actors[this.controlledActorIdx];
    if (!controlled) return;

    const teammates = this.actors
      .map((a, idx) => ({ a, idx }))
      .filter((item) => item.a.team === 'player' && item.idx !== this.controlledActorIdx);

    if (teammates.length === 0) return;

    // Pick closest / most open teammate
    teammates.sort((a, b) => a.a.pos.distanceTo(controlled.pos) - b.a.pos.distanceTo(controlled.pos));
    const target = teammates[0];

    if (this.ballOwnerIdx === this.controlledActorIdx) {
      // Throw realistic crisp pass
      this.lastPasserIdx = this.controlledActorIdx;
      this.assistWindowTimer = 3.0;
      this.ballOwnerIdx = null;
      this.ballState.inFlight = true;
      this.ballState.shotByTeam = null;
      this.ballState.hasScoredThisFlight = false;
      this.ballState.pos = { x: controlled.pos.x, y: 1.45, z: controlled.pos.z };
      this.ballState.lastPos = { ...this.ballState.pos };
      const vel = computeShotVelocity(
        this.ballState.pos,
        { x: target.a.pos.x, y: 1.3, z: target.a.pos.z },
        0.35
      );
      this.ballState.vel = vel;
      this.controlledActorIdx = target.idx;
      soundEngine.playBounce(0.6);
    } else {
      // Switch controlled defender
      this.controlledActorIdx = target.idx;
    }
  }

  public triggerStealOrContest() {
    if (this.phase !== 'playing') return;
    const actor = this.actors[this.controlledActorIdx];
    if (!actor || this.ballOwnerIdx === this.controlledActorIdx) return;

    soundEngine.playSqueak();
    actor.isDefending = true;

    if (this.ballOwnerIdx !== null) {
      const handler = this.actors[this.ballOwnerIdx];
      if (handler && handler.team !== actor.team && handler.pos.distanceTo(actor.pos) < 1.75) {
        const stealChance = 0.28 + (actor.card.stats.defense - handler.card.stats.handle) * 0.01;
        if (Math.random() < Math.max(0.15, Math.min(0.65, stealChance))) {
          this.ballOwnerIdx = this.controlledActorIdx;
          this.possession = 'player';
          this.shotClock = 24;
          this.stats.steals += 1;
          this.showFeedback('INTERCEPTION!', 'defense');
          soundEngine.playWhistle();
          this.setRefereeSignal('whistle_stop', 1.2);
          this.spawnBurst(actor.pos.x, 1.1, actor.pos.z, '#22C55E', 10);
          if (this.matchConfig.mode === 'tutorial' && this.tutorialStep === 4) {
            this.finishMatch();
          }
        }
      }
    }
  }

  private onShootPress() {
    if (this.phase !== 'playing' || this.inboundDelay > 0) return;
    const actor = this.actors[this.controlledActorIdx];
    if (!actor) return;

    if (this.ballOwnerIdx === this.controlledActorIdx) {
      // Check dunk eligibility first!
      const hoopZ = COURT_DIMS.playerHoopZ;
      const speed = actor.vel.length();
      if (
        canTriggerDunk({
          playerPos: { x: actor.pos.x, y: actor.verticalY, z: actor.pos.z },
          hoopZ,
          speed: Math.max(speed, 2.5),
          stamina: actor.stamina,
          dunkRating: actor.card.stats.dunk,
        })
      ) {
        this.executeDunk(actor, hoopZ);
        return;
      }

      // Begin jump-shot charge
      this.shootChargeActive = true;
      this.shootChargeRatio = 0;
      actor.isShooting = true;
      actor.shootTimer = 0;
      // Face the target hoop
      actor.facingYaw = Math.atan2(0 - actor.pos.x, hoopZ - actor.pos.z);
    } else if (!actor.isBlocking && actor.verticalY < 0.05) {
      // Defense: Block / Rebound Jump!
      actor.isBlocking = true;
      actor.blockTimer = 0.45;
      actor.verticalVel = 5.6;
      soundEngine.playSqueak();

      // Check immediate block if ball in flight near actor
      if (this.ballState.inFlight && this.ballState.shotByTeam === 'opponent') {
        const dist = Math.hypot(
          this.ballState.pos.x - actor.pos.x,
          this.ballState.pos.z - actor.pos.z
        );
        if (dist < 1.45 && this.ballState.pos.y < 3.4) {
          this.ballState.vel.x = (Math.random() - 0.5) * 6;
          this.ballState.vel.z = 5.5;
          this.ballState.vel.y = 2.2;
          this.ballState.shotByTeam = null;
          this.stats.blocks += 1;
          this.trauma = Math.min(1, this.trauma + 0.5);
          this.hitstopTimer = 0.055;
          soundEngine.playBackboard();
          this.showFeedback('CONTRE MONSTRUEUX!', 'defense');
          this.spawnBurst(this.ballState.pos.x, this.ballState.pos.y, this.ballState.pos.z, '#EF4444', 14);
        }
      }
    }
  }

  private onShootRelease() {
    if (!this.shootChargeActive) return;
    this.shootChargeActive = false;
    const actor = this.actors[this.controlledActorIdx];
    if (!actor || this.ballOwnerIdx !== this.controlledActorIdx) {
      if (actor) actor.isShooting = false;
      return;
    }

    this.releaseJumpShot(actor, this.shootChargeRatio, this.shootSweetSpot);
  }

  private executeDunk(actor: ActorState, hoopZ: number) {
    this.shootChargeActive = false;
    actor.isDunking = true;
    actor.dunkTimer = 0;
    actor.dunkStartPos.copy(actor.pos);
    actor.dunkTargetPos.set(0, 0, hoopZ + (hoopZ < 0 ? 0.55 : -0.55));
    actor.facingYaw = Math.atan2(0 - actor.pos.x, hoopZ - actor.pos.z);
    actor.stamina = Math.max(0, actor.stamina - 14);
    soundEngine.playSqueak();
  }

  private releaseJumpShot(actor: ActorState, holdRatio: number, sweetSpot: number) {
    const hoopZ = actor.team === 'player' ? COURT_DIMS.playerHoopZ : COURT_DIMS.opponentHoopZ;
    const dist = Math.hypot(actor.pos.x, actor.pos.z - hoopZ);
    const pointValue = getShotPointValue({ x: actor.pos.x, y: 0, z: actor.pos.z }, hoopZ);

    // Measure closest defender contest
    let minDefDist = 99;
    for (const other of this.actors) {
      if (other.team !== actor.team) {
        const d = other.pos.distanceTo(actor.pos);
        if (d < minDefDist) minDefDist = d;
      }
    }
    const contestFactor = minDefDist < 1.2 ? 0.85 : minDefDist < 2.2 ? 0.45 : 0.0;
    const rating = pointValue === 3 ? actor.card.stats.threePoint : actor.card.stats.midRange;

    const evalRes = evaluateShotRelease({
      holdRatio,
      sweetSpot,
      distanceMeters: dist,
      contestFactor,
      shooterRating: rating + (actor.team === 'player' && this.hotStreak >= 2 ? 4 : 0),
      stamina: actor.stamina,
      shotAssist: actor.team === 'player' ? this.matchConfig.shotAssist : true,
      rngValue: Math.random(),
    });

    if (actor.team === 'player') {
      this.stats.fieldGoalsAttempted += 1;
      if (pointValue === 3) this.stats.threePointersAttempted += 1;
      if (evalRes.grade === 'perfect') {
        this.stats.perfectReleases += 1;
        soundEngine.playGreenRelease();
        this.showFeedback('VERT PARFAIT!', 'perfect');
        this.spawnBurst(actor.pos.x, 2.3, actor.pos.z, '#22C55E', 10);
      } else {
        this.showFeedback(evalRes.label, evalRes.grade === 'good' ? 'good' : 'miss');
      }
    }

    actor.verticalVel = 4.6;
    actor.squashY = 1.15;
    actor.isShooting = false;

    const from = {
      x: actor.pos.x,
      y: 2.25 * actor.rig.heightScale,
      z: actor.pos.z,
    };
    const target = {
      x: evalRes.lateralOffset,
      y: COURT_DIMS.hoopY,
      z: hoopZ + evalRes.depthOffset,
    };

    this.ballOwnerIdx = null;
    this.ballState.pos = { ...from };
    this.ballState.lastPos = { ...from };
    this.ballState.vel = computeShotVelocity(from, target, 1.6 + Math.min(0.8, dist * 0.08));
    this.ballState.spin = { x: -10, y: 0, z: 0 };
    this.ballState.inFlight = true;
    this.ballState.shotByTeam = actor.team;
    this.ballState.shotValue = pointValue;
    this.ballState.hasScoredThisFlight = false;
    if (pointValue === 3) {
      this.setRefereeSignal('three_attempt', 1.5);
    }
    soundEngine.playBounce(0.4);
  }

  private setRefereeSignal(signal: RefereeSignal, duration: number) {
    this.refereeSignal = signal;
    this.refereeSignalTimer = duration;
  }

  private showFeedback(text: string, tone: NonNullable<HudSnapshot['shotFeedback']>['tone']) {
    this.activeFeedback = { text, tone, id: this.feedbackIdCounter++ };
    this.feedbackTimer = 1.85;
  }

  private spawnBurst(x: number, y: number, z: number, hexColor: string, count: number) {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      slot.active = true;
      slot.life = 0;
      slot.maxLife = 0.35 + Math.random() * 0.35;
      slot.pos.set(x, y, z);
      slot.vel.set(
        (Math.random() - 0.5) * 5.2,
        1.5 + Math.random() * 4.5,
        (Math.random() - 0.5) * 5.2
      );
      slot.scale = 0.8 + Math.random() * 1.1;
      slot.color.set(hexColor);
    }
  }

  private scheduleNextTick() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        this.frameId = requestAnimationFrame(this.tick);
      });
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsed += dt;

    if (this.phase === 'title') {
      this.updateTitleShowcase(dt);
      this.updateReferee(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
      this.updateReferee(dt);
    }

    // Update hoop spring physics, crowd bounce & pooled particles even during hitstop
    this.updateHoopSprings(dt);
    this.updateCrowdAndParticles(dt);
    this.updateCamera(dt);

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  private updateReferee(dt: number) {
    if (this.refereeSignalTimer > 0) {
      this.refereeSignalTimer -= dt;
      if (this.refereeSignalTimer <= 0) {
        this.refereeSignal = 'none';
      }
    }

    const ballX = this.ballState.pos.x;
    const ballZ = this.ballState.pos.z;
    // Referee positions on opposite sideline to keep clear of players & always view ball
    const targetSideX = ballX > 1.5 ? -6.8 : 6.8;
    const targetZ = THREE.MathUtils.clamp(ballZ * 0.72 + (ballZ < 0 ? 1.8 : -1.8), -9.8, 9.8);

    _v1.set(targetSideX, 0, targetZ);
    _v2.subVectors(_v1, this.refereePos);
    const dist = _v2.length();
    const desiredSpeed = dist > 0.35 ? Math.min(4.6, dist * 2.4) : 0;

    if (desiredSpeed > 0.1) {
      _v2.normalize().multiplyScalar(desiredSpeed);
      this.refereeVel.lerp(_v2, 1 - Math.exp(-8 * dt));
    } else {
      this.refereeVel.multiplyScalar(Math.exp(-10 * dt));
    }
    this.refereePos.addScaledVector(this.refereeVel, dt);
    const speed = this.refereeVel.length();
    this.refereeStride += speed * dt * 2.4;

    // Referee always turns smoothly to watch the ball/play
    const desiredYaw = Math.atan2(ballX - this.refereePos.x, ballZ - this.refereePos.z);
    let diff = desiredYaw - this.refereeYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.refereeYaw += diff * (1 - Math.exp(-10 * dt));

    this.refereeRig.root.position.copy(this.refereePos);
    this.refereeRig.root.rotation.y = this.refereeYaw;
    animateRefereeRig(this.refereeRig, speed, this.refereeStride, this.refereeSignal, dt, this.elapsed);
  }

  private updateTitleShowcase(dt: number) {
    // Ambient warm-up motion on center/right court (clear of left Title panel)
    if (this.actors.length >= 2) {
      const a0 = this.actors[0];
      const a1 = this.actors[1];

      const prevX0 = a0.pos.x;
      const prevZ0 = a0.pos.z;
      const prevYaw0 = a0.facingYaw;
      a0.pos.set(1.6 + Math.sin(this.elapsed * 0.65) * 1.9, 0, -2.5 + Math.cos(this.elapsed * 0.5) * 1.4);
      a0.facingYaw = Math.atan2(0 - a0.pos.x, COURT_DIMS.playerHoopZ - a0.pos.z);
      const vx0 = (a0.pos.x - prevX0) / dt;
      const vz0 = (a0.pos.z - prevZ0) / dt;
      const cos0 = Math.cos(a0.facingYaw);
      const sin0 = Math.sin(a0.facingYaw);
      const lvx0 = vx0 * cos0 - vz0 * sin0;
      const lvz0 = vx0 * sin0 + vz0 * cos0;
      const lax0 = ((vx0 - a0.prevVel.x) / dt) * cos0 - ((vz0 - a0.prevVel.z) / dt) * sin0;
      const laz0 = ((vx0 - a0.prevVel.x) / dt) * sin0 + ((vz0 - a0.prevVel.z) / dt) * cos0;
      a0.prevVel.set(vx0, 0, vz0);

      a0.dribbleCycle = (a0.dribbleCycle + dt * 1.9) % 1;
      a0.stridePhase += dt * 4.5;
      a0.rig.root.position.copy(a0.pos);
      a0.rig.root.rotation.y = a0.facingYaw;
      animatePlayerRig(
        a0.rig,
        {
          speed: 2.3,
          maxSpeed: 6,
          stridePhase: a0.stridePhase,
          verticalY: 0,
          localVelX: lvx0,
          localVelZ: lvz0,
          worldVelY: 0,
          localAccelX: lax0,
          localAccelY: 0,
          localAccelZ: laz0,
          angularVelY: (a0.facingYaw - prevYaw0) / dt,
          isDribbling: true,
          dribbleCycle: a0.dribbleCycle,
          isShooting: false,
          shootWindup: 0,
          isDunking: false,
          dunkProgress: 0,
          isCrossover: false,
          crossoverProgress: 0,
          isDefending: false,
          isBlocking: false,
          blockTimer: 0,
          squashY: 1,
          turnBank: Math.cos(this.elapsed * 0.65) * 0.25,
          lookYaw: 0,
          isControlled: false,
          hasBall: true,
        },
        dt,
        this.elapsed
      );

      const prevX1 = a1.pos.x;
      const prevZ1 = a1.pos.z;
      const prevYaw1 = a1.facingYaw;
      a1.pos.set(1.6 - Math.sin(this.elapsed * 0.65) * 1.2, 0, -5.8);
      a1.facingYaw = Math.atan2(a0.pos.x - a1.pos.x, a0.pos.z - a1.pos.z);
      const vx1 = (a1.pos.x - prevX1) / dt;
      const vz1 = (a1.pos.z - prevZ1) / dt;
      const cos1 = Math.cos(a1.facingYaw);
      const sin1 = Math.sin(a1.facingYaw);
      a1.prevVel.set(vx1, 0, vz1);

      a1.stridePhase += dt * 3.4;
      a1.rig.root.position.copy(a1.pos);
      a1.rig.root.rotation.y = a1.facingYaw;
      animatePlayerRig(
        a1.rig,
        {
          speed: 1.6,
          maxSpeed: 6,
          stridePhase: a1.stridePhase,
          verticalY: 0,
          localVelX: vx1 * cos1 - vz1 * sin1,
          localVelZ: vx1 * sin1 + vz1 * cos1,
          worldVelY: 0,
          localAccelX: 0,
          localAccelY: 0,
          localAccelZ: 0,
          angularVelY: (a1.facingYaw - prevYaw1) / dt,
          isDribbling: false,
          dribbleCycle: 0,
          isShooting: false,
          shootWindup: 0,
          isDunking: false,
          dunkProgress: 0,
          isCrossover: false,
          crossoverProgress: 0,
          isDefending: true,
          isBlocking: false,
          blockTimer: 0,
          squashY: 1,
          turnBank: 0,
          lookYaw: 0,
          isControlled: false,
          hasBall: false,
        },
        dt,
        this.elapsed
      );

      // Sync basketball to warm-up dribbler's hand
      const bounceH = Math.abs(Math.sin(a0.dribbleCycle * Math.PI * 2)) * 0.88 + COURT_DIMS.ballRadius;
      const rightX = Math.cos(a0.facingYaw) * 0.34;
      const rightZ = -Math.sin(a0.facingYaw) * 0.34;
      this.ballState.pos.x = a0.pos.x + rightX;
      this.ballState.pos.y = bounceH;
      this.ballState.pos.z = a0.pos.z + rightZ;
      this.ballMesh.position.set(this.ballState.pos.x, bounceH, this.ballState.pos.z);
      this.ballShadow.position.set(this.ballMesh.position.x, 0.016, this.ballMesh.position.z);
    }
  }

  private updatePlaying(dt: number) {
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) this.activeFeedback = null;
    }

    if (this.assistWindowTimer > 0) {
      this.assistWindowTimer -= dt;
      if (this.assistWindowTimer <= 0) this.lastPasserIdx = null;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Clocks
    if (this.inboundDelay > 0) {
      this.inboundDelay -= dt;
    } else {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.ballOwnerIdx !== null || this.ballState.inFlight) {
        this.shotClock = Math.max(0, this.shotClock - dt);
        if (this.shotClock <= 5 && Math.ceil(this.shotClock) !== this.lastShotClockBeep && this.shotClock > 0) {
          this.lastShotClockBeep = Math.ceil(this.shotClock);
        }
        if (this.shotClock <= 0 && !this.ballState.inFlight) {
          soundEngine.playBuzzer();
          this.showFeedback('24s EXPIRÉES!', 'miss');
          this.switchPossession(this.possession === 'player' ? 'opponent' : 'player');
        }
      }
      if (this.timeRemaining <= 0 && this.matchConfig.mode !== 'tutorial') {
        soundEngine.playBuzzer();
        this.finishMatch();
        return;
      }
    }

    // Shot charge meter progression
    if (this.shootChargeActive) {
      const actor = this.actors[this.controlledActorIdx];
      const speedMul = actor ? 1.15 + (1 - actor.card.stats.threePoint / 120) * 0.35 : 1.3;
      this.shootChargeRatio = Math.min(1, this.shootChargeRatio + dt * speedMul);
      if (actor) actor.shootTimer = this.shootChargeRatio;
      if (this.shootChargeRatio >= 0.99) {
        this.onShootRelease();
      }
    }

    // Update every actor (player-controlled + teammates + opponents)
    this.actors.forEach((actor, idx) => {
      if (actor.crossoverCooldown > 0) actor.crossoverCooldown -= dt;
      if (actor.crossoverTimer > 0) actor.crossoverTimer = Math.max(0, actor.crossoverTimer - dt);
      if (actor.stunTimer > 0) {
        actor.stunTimer -= dt;
        actor.vel.multiplyScalar(Math.exp(-8 * dt));
      }

      const prevYaw = actor.facingYaw;
      actor.prevVel.copy(actor.vel);
      actor.prevVerticalVel = actor.verticalVel;

      if (idx === this.controlledActorIdx) {
        this.updateControlledActor(actor, dt);
      } else {
        this.updateAiActor(actor, idx, dt);
      }

      // Compute turn banking, angular velocity & head gaze angle toward ball/hoop
      let yawDelta = actor.facingYaw - prevYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      const safeDt = Math.max(dt, 0.004);
      actor.angularVelY = yawDelta / safeDt;
      const targetBank = THREE.MathUtils.clamp(actor.angularVelY * 0.14, -1, 1);
      actor.turnBank = THREE.MathUtils.lerp(actor.turnBank, targetBank, 1 - Math.exp(-10 * dt));

      const lookTargetX = this.ballOwnerIdx === idx ? 0 : this.ballState.pos.x;
      const lookTargetZ =
        this.ballOwnerIdx === idx
          ? actor.team === 'player'
            ? COURT_DIMS.playerHoopZ
            : COURT_DIMS.opponentHoopZ
          : this.ballState.pos.z;
      const desiredGaze = Math.atan2(lookTargetX - actor.pos.x, lookTargetZ - actor.pos.z) - actor.facingYaw;
      let normGaze = desiredGaze;
      while (normGaze > Math.PI) normGaze -= Math.PI * 2;
      while (normGaze < -Math.PI) normGaze += Math.PI * 2;
      actor.lookYaw = normGaze;

      // Vertical jump physics
      if (!actor.isDunking && (actor.verticalY > 0 || actor.verticalVel !== 0)) {
        actor.verticalY += actor.verticalVel * dt;
        actor.verticalVel += -16.5 * dt;
        if (actor.verticalY <= 0) {
          actor.verticalY = 0;
          actor.verticalVel = 0;
          actor.squashY = 0.82; // landing squash
          actor.isBlocking = false;
        }
      }
      actor.squashY = THREE.MathUtils.damp(actor.squashY, 1, 14, dt);

      // Compute local acceleration in actor frame for realistic cloth inertia
      const worldAx = (actor.vel.x - actor.prevVel.x) / safeDt;
      const worldAz = (actor.vel.z - actor.prevVel.z) / safeDt;
      const worldAy = (actor.verticalVel - actor.prevVerticalVel) / safeDt;
      const cosYaw = Math.cos(actor.facingYaw);
      const sinYaw = Math.sin(actor.facingYaw);
      actor.localAccelX = worldAx * cosYaw - worldAz * sinYaw;
      actor.localAccelY = worldAy;
      actor.localAccelZ = worldAx * sinYaw + worldAz * cosYaw;

      // Integrate position & clamp inside court bounds (dunk interpolates pos directly)
      if (!actor.isDunking) {
        actor.pos.addScaledVector(actor.vel, dt);
      }
      actor.pos.x = THREE.MathUtils.clamp(actor.pos.x, -COURT_DIMS.halfWidth + 0.45, COURT_DIMS.halfWidth - 0.45);
      actor.pos.z = THREE.MathUtils.clamp(actor.pos.z, -COURT_DIMS.halfLength + 0.45, COURT_DIMS.halfLength - 0.45);
    });

    // Soft athlete-to-athlete body separation so defenders feel physical
    for (let i = 0; i < this.actors.length; i++) {
      for (let j = i + 1; j < this.actors.length; j++) {
        const a = this.actors[i];
        const b = this.actors[j];
        if (a.isDunking || b.isDunking) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const minSep = 0.72;
        if (dist > 0.001 && dist < minSep) {
          const push = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }

    // Apply skeletal kinematics + cloth physics after collision resolution
    this.actors.forEach((actor, idx) => {
      const speed = actor.vel.length();
      actor.stridePhase += speed * dt * 2.55;
      if (this.ballOwnerIdx === idx) {
        actor.dribbleCycle = (actor.dribbleCycle + dt * (1.75 + speed * 0.28)) % 1;
      }

      const cosYaw = Math.cos(actor.facingYaw);
      const sinYaw = Math.sin(actor.facingYaw);
      const localVelX = actor.vel.x * cosYaw - actor.vel.z * sinYaw;
      const localVelZ = actor.vel.x * sinYaw + actor.vel.z * cosYaw;

      actor.rig.root.position.copy(actor.pos);
      actor.rig.root.rotation.y = actor.facingYaw;

      animatePlayerRig(
        actor.rig,
        {
          speed,
          maxSpeed: 7.5,
          stridePhase: actor.stridePhase,
          verticalY: actor.verticalY,
          localVelX,
          localVelZ,
          worldVelY: actor.verticalVel,
          localAccelX: actor.localAccelX,
          localAccelY: actor.localAccelY,
          localAccelZ: actor.localAccelZ,
          angularVelY: actor.angularVelY,
          isDribbling: this.ballOwnerIdx === idx && !actor.isShooting && !actor.isDunking,
          dribbleCycle: actor.dribbleCycle,
          isShooting: actor.isShooting,
          shootWindup: actor.shootTimer,
          isDunking: actor.isDunking,
          dunkProgress: actor.dunkTimer / 0.48,
          isCrossover: actor.crossoverTimer > 0,
          crossoverProgress: 1 - actor.crossoverTimer / 0.38,
          isDefending: actor.isDefending,
          isBlocking: actor.isBlocking,
          blockTimer: actor.blockTimer,
          squashY: actor.squashY,
          turnBank: actor.turnBank,
          lookYaw: actor.lookYaw,
          isControlled: idx === this.controlledActorIdx,
          hasBall: this.ballOwnerIdx === idx,
        },
        dt,
        this.elapsed
      );
    });

    // Update Basketball (either held/dribbled by owner OR in free flight physics)
    this.updateBall(dt);

    // Emit HUD snapshot at ~12Hz to keep React ultra-fast
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.08) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private updateControlledActor(actor: ActorState, dt: number) {
    if (actor.isDunking) {
      this.stepDunkAnimation(actor, dt);
      return;
    }

    let ix = this.virtualInput.moveX;
    let iz = this.virtualInput.moveZ;

    if (this.keys.has('KeyA') || this.keys.has('KeyQ') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    if (this.keys.has('KeyW') || this.keys.has('KeyZ') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;

    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }

    if (len > 0.25 && this.matchConfig.mode === 'tutorial' && this.tutorialStep === 0) {
      this.tutorialStep = 1;
    }

    const sprinting =
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtualInput.sprint) &&
      actor.stamina > 5;
    if (sprinting && len > 0.1) {
      actor.stamina = Math.max(0, actor.stamina - 16 * dt);
    } else {
      actor.stamina = Math.min(100, actor.stamina + 11 * dt);
    }

    const baseSpeed = 4.3 + (actor.card.stats.speed / 99) * 2.2;
    const targetSpeed = baseSpeed * (sprinting ? 1.32 : 1.0) * (this.shootChargeActive ? 0.2 : 1.0);
    actor.isDefending = this.keys.has('KeyF') && this.ballOwnerIdx !== this.controlledActorIdx;

    if (actor.stunTimer <= 0) {
      const targetVx = ix * targetSpeed;
      const targetVz = iz * targetSpeed;
      const accel = 1 - Math.exp(-14 * dt);
      actor.vel.x = THREE.MathUtils.lerp(actor.vel.x, targetVx, accel);
      actor.vel.z = THREE.MathUtils.lerp(actor.vel.z, targetVz, accel);
    }

    if (len > 0.1 && !this.shootChargeActive) {
      const desiredYaw = Math.atan2(ix, iz);
      let diff = desiredYaw - actor.facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      actor.facingYaw += diff * (1 - Math.exp(-14 * dt));
    }
  }

  private stepDunkAnimation(actor: ActorState, dt: number) {
    actor.dunkTimer += dt;
    const duration = 0.48;
    const t = Math.min(1, actor.dunkTimer / duration);

    actor.pos.lerpVectors(actor.dunkStartPos, actor.dunkTargetPos, t);
    actor.verticalY = Math.sin(t * Math.PI) * 1.45;
    actor.vel.set(
      (actor.dunkTargetPos.x - actor.dunkStartPos.x) / duration,
      0,
      (actor.dunkTargetPos.z - actor.dunkStartPos.z) / duration
    );
    actor.verticalVel = ((1.45 * Math.PI) / duration) * Math.cos(t * Math.PI);

    if (t >= 1) {
      actor.isDunking = false;
      actor.verticalY = 0;
      actor.verticalVel = 0;
      actor.vel.set(0, 0, 0);
      actor.squashY = 0.78;
      const hoopZ = actor.team === 'player' ? COURT_DIMS.playerHoopZ : COURT_DIMS.opponentHoopZ;
      const hoop = actor.team === 'player' ? this.hoops.player : this.hoops.opponent;

      // Slam rim flex + hitstop + camera trauma + particles!
      hoop.rimFlexVel = -6.5;
      hoop.netRipple = 1.0;
      this.trauma = Math.min(1, this.trauma + 0.75);
      this.hitstopTimer = 0.055;
      this.crowdExcitement = 1.0;
      soundEngine.playDunkSlam();
      this.spawnBurst(0, COURT_DIMS.hoopY, hoopZ, '#F59E0B', 22);

      // Ball drops straight through rim
      this.ballOwnerIdx = null;
      this.ballState.pos = { x: 0, y: COURT_DIMS.hoopY - 0.15, z: hoopZ };
      this.ballState.lastPos = { x: 0, y: COURT_DIMS.hoopY + 0.1, z: hoopZ };
      this.ballState.vel = { x: 0, y: -4.2, z: 0 };
      this.ballState.inFlight = true;
      this.ballState.hasScoredThisFlight = true;

      this.registerBasket(actor.team, 2, true);
    }
  }

  private updateAiActor(actor: ActorState, idx: number, dt: number) {
    if (actor.isDunking) {
      this.stepDunkAnimation(actor, dt);
      return;
    }
    if (actor.stunTimer > 0) return;

    const isOwner = this.ballOwnerIdx === idx;
    const attackHoopZ = actor.team === 'player' ? COURT_DIMS.playerHoopZ : COURT_DIMS.opponentHoopZ;
    const defendHoopZ = actor.team === 'player' ? COURT_DIMS.opponentHoopZ : COURT_DIMS.playerHoopZ;
    const targetPos = _v1;

    if (isOwner) {
      // AI Ball Handler (opponent offense)
      actor.aiDecisionTimer -= dt;
      const distToHoop = Math.hypot(actor.pos.x, actor.pos.z - attackHoopZ);

      if (actor.aiChargingShot) {
        actor.aiShotCharge += dt;
        actor.vel.multiplyScalar(0.85);
        actor.facingYaw = Math.atan2(0 - actor.pos.x, attackHoopZ - actor.pos.z);
        if (actor.aiShotCharge >= 0.45) {
          actor.aiChargingShot = false;
          actor.aiShotCharge = 0;
          const sweet = 0.72;
          const release = sweet + (Math.random() - 0.5) * 0.24;
          this.releaseJumpShot(actor, release, sweet);
        }
        return;
      }

      if (
        canTriggerDunk({
          playerPos: { x: actor.pos.x, y: 0, z: actor.pos.z },
          hoopZ: attackHoopZ,
          speed: 3.5,
          stamina: actor.stamina,
          dunkRating: actor.card.stats.dunk,
        })
      ) {
        this.executeDunk(actor, attackHoopZ);
        return;
      }

      // Drive toward hoop or pull up for 3PT
      targetPos.set(Math.sin(this.elapsed * 0.9 + idx) * 2.4, 0, attackHoopZ - Math.sign(attackHoopZ) * 3.8);
      if (actor.aiDecisionTimer <= 0 && distToHoop < 7.5 && distToHoop > 2.4) {
        actor.aiDecisionTimer = 1.4 + Math.random() * 1.2;
        if (Math.random() < 0.55) {
          actor.aiChargingShot = true;
          actor.aiShotCharge = 0;
          actor.isShooting = true;
          return;
        }
      }
    } else if (this.ballOwnerIdx !== null && this.actors[this.ballOwnerIdx].team === actor.team) {
      // Offensive spacing / cutting teammate
      const owner = this.actors[this.ballOwnerIdx];
      const side = idx % 2 === 0 ? 1 : -1;
      if (actor.aiRole === 'rim_protector') {
        targetPos.set(side * 2.2, 0, attackHoopZ - Math.sign(attackHoopZ) * 2.6);
      } else {
        targetPos.set(side * 5.2, 0, attackHoopZ - Math.sign(attackHoopZ) * 5.4);
      }
      if (owner.pos.distanceTo(targetPos) < 2.5) targetPos.x *= -1;
    } else {
      // Defense policies: On-ball lockdown, Rim protector, Wing closeout
      const handler =
        this.ballOwnerIdx !== null
          ? this.actors[this.ballOwnerIdx]
          : this.actors[this.controlledActorIdx];
      actor.isDefending = true;

      if (actor.aiRole === 'rim_protector') {
        // Guard the paint between ball and basket
        targetPos.set(handler.pos.x * 0.35, 0, defendHoopZ - Math.sign(defendHoopZ) * 2.2);
      } else {
        // Stay between handler and our defended basket
        const dirX = 0 - handler.pos.x;
        const dirZ = defendHoopZ - handler.pos.z;
        const len = Math.max(0.1, Math.hypot(dirX, dirZ));
        const guardDist = this.matchConfig.mode === 'tutorial' ? 2.4 : 1.55;
        targetPos.set(
          handler.pos.x + (dirX / len) * guardDist,
          0,
          handler.pos.z + (dirZ / len) * guardDist
        );
      }
    }

    _v2.subVectors(targetPos, actor.pos);
    const dist = _v2.length();
    const moveSpeed = (3.8 + (actor.card.stats.speed / 99) * 1.9) * (isOwner ? 1.05 : 0.94);

    if (dist > 0.25) {
      _v2.normalize().multiplyScalar(Math.min(moveSpeed, dist * 4));
      actor.vel.lerp(_v2, 1 - Math.exp(-10 * dt));
      actor.facingYaw = Math.atan2(actor.vel.x, actor.vel.z);
    } else {
      actor.vel.multiplyScalar(Math.exp(-10 * dt));
      const lookZ = this.ballState.pos.z - actor.pos.z;
      const lookX = this.ballState.pos.x - actor.pos.x;
      actor.facingYaw = Math.atan2(lookX, lookZ);
    }
  }

  private updateBall(dt: number) {
    if (this.ballOwnerIdx !== null && this.actors[this.ballOwnerIdx]) {
      const owner = this.actors[this.ballOwnerIdx];
      const bouncePhase = owner.dribbleCycle;
      const bounceY = Math.abs(Math.sin(bouncePhase * Math.PI * 2)) * 0.85 + COURT_DIMS.ballRadius;

      // Play subtle dribble bounce sound at bottom of bounce arc
      if (bouncePhase < 0.06 && owner.vel.length() > 0.8 && Math.random() < 0.45) {
        soundEngine.playBounce(0.38);
      }

      const forwardX = Math.sin(owner.facingYaw) * 0.36;
      const forwardZ = Math.cos(owner.facingYaw) * 0.36;
      const rightX = Math.cos(owner.facingYaw) * 0.26;
      const rightZ = -Math.sin(owner.facingYaw) * 0.26;

      this.ballState.pos.x = owner.pos.x + forwardX + rightX;
      this.ballState.pos.z = owner.pos.z + forwardZ + rightZ;
      this.ballState.pos.y = owner.isShooting || owner.isDunking ? 2.1 + owner.verticalY : bounceY;
      this.ballMesh.position.set(this.ballState.pos.x, this.ballState.pos.y, this.ballState.pos.z);
      this.ballMesh.rotation.x += dt * 4;
      this.ballShadow.position.set(this.ballState.pos.x, 0.016, this.ballState.pos.z);
      return;
    }

    // Free flight / pass / rebound physics
    const subSteps = 3;
    const subDt = dt / subSteps;
    for (let s = 0; s < subSteps; s++) {
      const res = stepBallPhysics(this.ballState, subDt, COURT_DIMS);
      if (res.hitFloor) soundEngine.playBounce(0.65);
      if (res.hitRim) {
        soundEngine.playRimClank();
        const hoop = this.ballState.pos.z < 0 ? this.hoops.player : this.hoops.opponent;
        hoop.rimFlexVel = -2.2;
      }
      if (res.hitBackboard) soundEngine.playBackboard();
      if (res.scored && this.ballState.shotByTeam) {
        const hoop = this.ballState.pos.z < 0 ? this.hoops.player : this.hoops.opponent;
        hoop.netRipple = 1.0;
        if (res.swish) soundEngine.playSwish();
        this.registerBasket(this.ballState.shotByTeam, this.ballState.shotValue, false);
        this.ballState.shotByTeam = null;
      }
    }

    this.ballMesh.position.set(this.ballState.pos.x, this.ballState.pos.y, this.ballState.pos.z);
    this.ballMesh.rotation.x += this.ballState.spin.x * dt;
    this.ballMesh.rotation.z += this.ballState.vel.x * dt;
    this.ballShadow.position.set(this.ballState.pos.x, 0.016, this.ballState.pos.z);

    // Loose ball / pass / rebound pickup check
    if (this.ballState.pos.y < 1.9 && !this.ballState.hasScoredThisFlight && this.inboundDelay <= 0) {
      for (let i = 0; i < this.actors.length; i++) {
        const a = this.actors[i];
        if (a.isDunking) continue;
        const d = Math.hypot(a.pos.x - this.ballState.pos.x, a.pos.z - this.ballState.pos.z);
        if (d < 0.85 && (this.ballState.shotByTeam === null || this.ballState.vel.y < 1.5)) {
          const wasRebound = this.ballState.shotByTeam !== null;
          this.ballOwnerIdx = i;
          this.ballState.inFlight = false;
          this.possession = a.team;
          if (a.team === 'player') {
            this.controlledActorIdx = i;
            if (wasRebound) {
              this.stats.rebounds += 1;
              this.showFeedback('REBOND!', 'good');
            }
          }
          if (wasRebound) this.shotClock = 24;
          break;
        }
      }
    }
  }

  private registerBasket(team: 'player' | 'opponent', points: 2 | 3, isDunk: boolean) {
    this.crowdExcitement = 1.0;
    soundEngine.playCrowdRoar(points === 3 || isDunk ? 0.9 : 0.55);
    this.setRefereeSignal(points === 3 ? 'three_good' : 'two_good', 1.8);

    if (team === 'player') {
      this.playerScore += points;
      this.stats.pointsScored += points;
      this.stats.fieldGoalsMade += 1;
      if (points === 3) this.stats.threePointersMade += 1;
      if (isDunk) {
        this.stats.dunks += 1;
        this.stats.fieldGoalsMade += 1;
        this.stats.fieldGoalsAttempted += 1;
      }
      if (this.lastPasserIdx !== null && this.assistWindowTimer > 0) {
        this.stats.assists += 1;
      }
      this.hotStreak += 1;

      if (isDunk) {
        this.showFeedback('DUNK MONSTRUEUX! +2', 'dunk');
      } else if (points === 3) {
        this.showFeedback('SPLASH 3 PTS!', 'perfect');
        this.spawnBurst(0, COURT_DIMS.hoopY, COURT_DIMS.playerHoopZ, '#38BDF8', 16);
      } else {
        this.showFeedback(`PANIER! +${points}`, 'good');
      }

      if (this.matchConfig.mode === 'tutorial') {
        if (this.tutorialStep === 2 && !isDunk) this.tutorialStep = 3;
        else if (isDunk && this.tutorialStep <= 3) this.tutorialStep = 4;
      }
    } else {
      this.opponentScore += points;
      this.hotStreak = 0;
      this.showFeedback(`ADVERSAIRE +${points}`, 'miss');
    }

    // Check target score win (Arcade / 1v1 / 3v3 first to target)
    if (
      this.matchConfig.ruleset === 'arcade' &&
      (this.playerScore >= this.matchConfig.targetScore ||
        this.opponentScore >= this.matchConfig.targetScore)
    ) {
      soundEngine.playBuzzer();
      this.finishMatch();
      return;
    }

    this.switchPossession(team === 'player' ? 'opponent' : 'player');
  }

  private switchPossession(nextTeam: 'player' | 'opponent') {
    this.possession = nextTeam;
    this.shotClock = 24;
    this.inboundDelay = 0.85;
    this.shootChargeActive = false;
    this.ballState.inFlight = false;
    this.ballState.hasScoredThisFlight = false;

    // Reset spacing cleanly for next possession
    const playerActors = this.actors.filter((a) => a.team === 'player');
    const oppActors = this.actors.filter((a) => a.team === 'opponent');

    if (nextTeam === 'player') {
      playerActors.forEach((a, i) => {
        a.pos.set(i === 0 ? 0 : i === 1 ? -4 : 4, 0, i === 0 ? 1.5 : -4.2);
        a.vel.set(0, 0, 0);
        a.isDunking = false;
        a.isShooting = false;
      });
      oppActors.forEach((a, i) => {
        a.pos.set(i === 0 ? 0 : i === 1 ? -3.5 : 1.5, 0, i === 0 ? -4.2 : -7.6);
        a.vel.set(0, 0, 0);
      });
      const idx = this.actors.findIndex((a) => a.team === 'player');
      this.controlledActorIdx = Math.max(0, idx);
      this.ballOwnerIdx = this.controlledActorIdx;
    } else {
      oppActors.forEach((a, i) => {
        a.pos.set(i === 0 ? 0 : i === 1 ? -4 : 4, 0, i === 0 ? -1.5 : 4.2);
        a.vel.set(0, 0, 0);
        a.isDunking = false;
        a.isShooting = false;
      });
      playerActors.forEach((a, i) => {
        a.pos.set(i === 0 ? 0 : i === 1 ? -3.5 : 1.5, 0, i === 0 ? 3.5 : 7.2);
        a.vel.set(0, 0, 0);
      });
      const idx = this.actors.findIndex((a) => a.team === 'opponent');
      this.ballOwnerIdx = idx >= 0 ? idx : null;
    }
  }

  private finishMatch() {
    this.phase = 'gameover';
    this.keys.clear();
    this.shootChargeActive = false;
    const won = this.playerScore >= this.opponentScore;
    const mvp = this.actors.find((a) => a.team === 'player')?.card.name ?? 'MVP';

    const xpEarned = (won ? 180 : 95) + this.stats.pointsScored * 8 + this.stats.dunks * 25;
    const coinsEarned = (won ? 320 : 140) + this.stats.pointsScored * 12 + this.stats.blocks * 30;
    const gemsEarned = won ? 18 : 5;

    this.callbacks.onMatchEnd({
      playerScore: this.playerScore,
      opponentScore: this.opponentScore,
      ...this.stats,
      mvpName: mvp,
      won,
      xpEarned,
      coinsEarned,
      gemsEarned,
    });
  }

  private updateHoopSprings(dt: number) {
    [this.hoops.player, this.hoops.opponent].forEach((h) => {
      const springForce = -110 * h.rimFlex - 12 * h.rimFlexVel;
      h.rimFlexVel += springForce * dt;
      h.rimFlex += h.rimFlexVel * dt;
      h.rimPivot.rotation.x = THREE.MathUtils.clamp(h.rimFlex * 0.14, -0.35, 0.2);

      if (h.netRipple > 0) {
        h.netRipple = Math.max(0, h.netRipple - dt * 1.4);
        const s = 1 + Math.sin(this.elapsed * 26) * 0.14 * h.netRipple;
        h.netMesh.scale.set(s, 1 - h.netRipple * 0.12, s);
      } else {
        h.netMesh.scale.set(1, 1, 1);
      }
    });
  }

  private updateCrowdAndParticles(dt: number) {
    if (this.crowdExcitement > 0) {
      this.crowdExcitement = Math.max(0, this.crowdExcitement - dt * 0.65);
    }

    if (this.crowdInstanced && this.crowdBaseMatrices.length > 0 && !this.isSoftwareGl) {
      for (let i = 0; i < this.crowdBaseMatrices.length; i++) {
        this.crowdBaseMatrices[i].decompose(_v1, _quat, _scaleVec);
        const cheer = Math.abs(Math.sin(this.elapsed * (3 + this.crowdExcitement * 7) + i * 0.7));
        const lift = cheer * (0.04 + this.crowdExcitement * 0.28);
        _v1.y += lift;
        _mat4.compose(_v1, _quat, _scaleVec);
        this.crowdInstanced.setMatrixAt(i, _mat4);
        if (this.crowdHeadInstanced) {
          _v1.y += 0.34 * _scaleVec.y;
          _scaleVec.set(_scaleVec.y, _scaleVec.y, _scaleVec.y);
          _mat4.compose(_v1, _quat, _scaleVec);
          this.crowdHeadInstanced.setMatrixAt(i, _mat4);
        }
      }
      this.crowdInstanced.instanceMatrix.needsUpdate = true;
      if (this.crowdHeadInstanced) this.crowdHeadInstanced.instanceMatrix.needsUpdate = true;
    }

    let anyParticle = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyParticle = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vel.y += -11 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const shrink = (1 - p.life / p.maxLife) * p.scale;
      _euler.set(p.life * 6, p.life * 8, 0);
      _quat.setFromEuler(_euler);
      _scaleVec.set(shrink, shrink, shrink);
      _mat4.compose(p.pos, _quat, _scaleVec);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyParticle) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateCamera(dt: number) {
    if (this.phase === 'title') {
      // Smooth cinematic arena broadcast pan framing players, referee & Jumbotron cleanly
      const angle = this.elapsed * 0.14;
      _v1.set(Math.sin(angle) * 11.2, 4.9 + Math.sin(this.elapsed * 0.25) * 0.7, Math.cos(angle) * 10.5 - 1.5);
      _v2.set(0.4, 1.5, -4.2);
      const k = 1 - Math.exp(-3.5 * dt);
      this.camPos.lerp(_v1, k);
      this.camLook.lerp(_v2, k);
    } else {
      const focus = this.actors[this.controlledActorIdx]?.pos ?? _v1.set(0, 0, 0);
      if (this.cameraMode === 0) {
        // Dynamic 2K-style angled follow cam facing player's target hoop (-Z)
        const targetZ = Math.max(-2.5, focus.z + 8.8);
        _v1.set(focus.x * 0.52, 5.8, targetZ);
        _v2.set(focus.x * 0.35, 1.4, Math.min(focus.z - 2.2, -3.5));
      } else if (this.cameraMode === 1) {
        // Side TV broadcast view
        _v1.set(13.5, 7.2, focus.z * 0.45);
        _v2.set(0, 1.4, focus.z * 0.55);
      } else {
        // Low court-side action angle
        _v1.set(focus.x * 0.4 + 4.2, 2.4, focus.z + 5.8);
        _v2.set(0, 2.0, COURT_DIMS.playerHoopZ);
      }
      const k = 1 - Math.exp(-6.5 * dt);
      this.camPos.lerp(_v1, k);
      this.camLook.lerp(_v2, k);
    }

    this.camera.position.copy(this.camPos);
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
      const shake = this.trauma * this.trauma * 0.38;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.camera.lookAt(this.camLook);
  }

  private emitHud() {
    const active = this.actors[this.controlledActorIdx];
    const tutorialHints = [
      'Déplace-toi sur le parquet avec ZQSD ou les Flèches.',
      'Appuie sur E pour réaliser un Crossover explosif.',
      'Maintiens ESPACE puis relâche dans la zone VERTE pour tirer !',
      'Sprinter (MAJ) + ESPACE près du cercle déclenche un DUNK !',
      'En défense, appuie sur F pour intercepter ou ESPACE pour contrer.',
    ];

    this.callbacks.onHudUpdate({
      playerScore: this.playerScore,
      opponentScore: this.opponentScore,
      timeRemaining: this.timeRemaining,
      shotClock: this.shotClock,
      activePlayerName: active?.card.shortName ?? 'JOUEUR',
      activePlayerOvr: active?.card.ovr ?? 90,
      activePlayerNumber: active?.card.jerseyNumber ?? 0,
      stamina: Math.round(active?.stamina ?? 100),
      isOnFire: this.hotStreak >= 2,
      isShooting: this.shootChargeActive,
      shotMeterRatio: this.shootChargeRatio,
      shotSweetSpot: this.shootSweetSpot,
      shotFeedback: this.activeFeedback,
      possession: this.possession,
      tutorialStep: this.tutorialStep,
      tutorialHint: tutorialHints[this.tutorialStep] ?? '',
    });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.phase !== 'playing') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }

    const wasDown = this.keys.has(e.code);
    this.keys.add(e.code);

    if (!wasDown) {
      if (e.code === 'Space') this.onShootPress();
      else if (e.code === 'KeyE') this.triggerCrossover();
      else if (e.code === 'KeyR' || e.code === 'Tab') {
        e.preventDefault();
        this.triggerPassOrSwitch();
      } else if (e.code === 'KeyF') this.triggerStealOrContest();
      else if (e.code === 'KeyC') this.cycleCamera();
      else if (e.code === 'Escape' || e.code === 'KeyP') this.callbacks.onPauseRequested();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'Space' && this.phase === 'playing') {
      this.onShootRelease();
    }
  };

  private handleBlur = () => {
    this.keys.clear();
    if (this.shootChargeActive) {
      this.onShootRelease();
    }
  };

  private handleResize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  };

  private bindEvents() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('resize', this.handleResize);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.clearActors();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
