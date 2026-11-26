export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type PlayerRole = 'meneur' | 'sniper' | 'finisher' | 'defenseur' | 'pivot' | 'ailier';
export type CardTier = 'legende' | 'diamant' | 'rubis' | 'emeraude';
export type CoachStyle = 'run_and_gun' | 'defense_physique' | 'pick_and_roll' | 'small_ball';
export type ArenaTheme = 'pro' | 'venice' | 'tokyo';
export type MatchMode = '1v1' | '2v2' | '3v3' | 'ranked' | 'tutorial';
export type Ruleset = 'classic' | 'arcade';
export type ControlScheme = 'keyboard' | 'touch' | 'gamepad';
export type Language = 'fr' | 'en';
export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface PlayerAppearance {
  skinTone: string;
  hairStyle: 'fade' | 'curly_high' | 'bald' | 'braids' | 'short_crop' | 'afro_taper';
  hairColor: string;
  facialHair: 'none' | 'goatee' | 'full_beard' | 'stubble';
  headband: boolean;
  armSleeve: 'none' | 'left' | 'right' | 'both';
  legSleeve: boolean;
  sneakerColor: string;
}

export interface PlayerStats {
  threePoint: number;
  midRange: number;
  dunk: number;
  handle: number;
  defense: number;
  speed: number;
  rebound: number;
  pass: number;
}

export interface PlayerCard {
  id: string;
  name: string;
  shortName: string;
  era: 'Actuel' | 'Légende';
  team: string;
  nationality: string;
  position: Position;
  role: PlayerRole;
  tier: CardTier;
  ovr: number;
  level: number;
  maxLevel: number;
  jerseyNumber: number;
  heightCm: number;
  wingspanCm: number;
  primaryColor: string;
  secondaryColor: string;
  portraitUrl?: string;
  badges: string[];
  signatureMove: string;
  stats: PlayerStats;
  appearance: PlayerAppearance;
}

export interface CoachCard {
  id: string;
  name: string;
  style: CoachStyle;
  styleLabel: string;
  description: string;
  ovrBonus: number;
  boostStat: keyof PlayerStats;
  boostAmount: number;
}

export interface PackDefinition {
  id: string;
  name: string;
  subtitle: string;
  costCoins: number;
  costGems?: number;
  cardCount: number;
  probabilities: {
    legende: number; // e.g. 0.12 = 12%
    diamant: number;
    rubis: number;
    emeraude: number;
  };
  guaranteedMinTier?: CardTier;
  accentColor: string;
}

export interface MissionProgress {
  id: string;
  title: string;
  description: string;
  category: 'daily' | 'weekly' | 'legend';
  metric: 'points' | 'threes' | 'dunks' | 'blocks' | 'steals' | 'wins' | 'matches';
  target: number;
  current: number;
  rewardCoins: number;
  rewardGems: number;
  claimed: boolean;
}

export interface CosmeticItem {
  id: string;
  name: string;
  category: 'court' | 'jersey' | 'celebration';
  themeId?: ArenaTheme;
  description: string;
  priceCoins: number;
  priceGems?: number;
  previewColor: string;
}

export interface MatchConfig {
  mode: MatchMode;
  durationSec: number; // e.g. 180 (3m), 300 (5m), or 90 for tutorial
  ruleset: Ruleset;
  arena: ArenaTheme;
  targetScore: number; // used in arcade / 1v1 / 3v3 first-to-N or time limit
  shotAssist: boolean;
}

export interface MatchBoxScore {
  playerScore: number;
  opponentScore: number;
  pointsScored: number;
  threePointersMade: number;
  threePointersAttempted: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  dunks: number;
  blocks: number;
  steals: number;
  assists: number;
  rebounds: number;
  perfectReleases: number;
  mvpName: string;
  won: boolean;
  xpEarned: number;
  coinsEarned: number;
  gemsEarned: number;
}

export interface HudSnapshot {
  playerScore: number;
  opponentScore: number;
  timeRemaining: number;
  shotClock: number;
  activePlayerName: string;
  activePlayerOvr: number;
  activePlayerNumber: number;
  stamina: number; // 0..100
  isOnFire: boolean;
  isShooting: boolean;
  shotMeterRatio: number; // 0..1
  shotSweetSpot: number; // 0.65..0.82
  shotFeedback: { text: string; tone: 'perfect' | 'good' | 'miss' | 'dunk' | 'defense'; id: number } | null;
  possession: 'player' | 'opponent' | 'loose';
  tutorialStep: number;
  tutorialHint: string;
}

export interface UserProfile {
  clubName: string;
  language: Language;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  rankDivision: string;
  rankPoints: number;
  ownedCardIds: string[];
  cardLevels: Record<string, number>;
  starterIds: string[]; // 5 starters
  coachId: string;
  selectedArena: ArenaTheme;
  unlockedArenas: ArenaTheme[];
  unlockedCosmetics: string[];
  equippedJerseyOverride: string | null;
  controlScheme: ControlScheme;
  shotAssist: boolean;
  passAssist: boolean;
  missions: MissionProgress[];
  matchesPlayed: number;
  matchesWon: number;
}
