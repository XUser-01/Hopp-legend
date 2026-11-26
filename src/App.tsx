import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DreamSquadModal } from './components/DreamSquadModal';
import { EventsShopModal } from './components/EventsShopModal';
import { PauseModal, ResultModal } from './components/GameModals';
import { MatchHud } from './components/MatchHud';
import { RecruitmentModal } from './components/RecruitmentModal';
import { TitleOverlay } from './components/TitleOverlay';
import { ArenaEngine } from './game/arenaScene';
import { soundEngine } from './game/audio';
import { computeSquadMetrics } from './game/physics';
import { COACHES, createInitialProfile, getEffectiveCard, PLAYER_ROSTER } from './game/playersData';
import {
  ArenaTheme,
  CosmeticItem,
  GamePhase,
  HudSnapshot,
  MatchBoxScore,
  MatchConfig,
  PackDefinition,
  PlayerCard,
  UserProfile,
} from './game/types';

const STORAGE_KEY = 'hoop-legends-profile-v1';

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfile;
      if (parsed && Array.isArray(parsed.starterIds) && parsed.starterIds.length >= 3) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return createInitialProfile();
}

const INITIAL_HUD: HudSnapshot = {
  playerScore: 0,
  opponentScore: 0,
  timeRemaining: 180,
  shotClock: 24,
  activePlayerName: 'S. CURRY',
  activePlayerOvr: 97,
  activePlayerNumber: 30,
  stamina: 100,
  isOnFire: false,
  isShooting: false,
  shotMeterRatio: 0,
  shotSweetSpot: 0.72,
  shotFeedback: null,
  possession: 'player',
  tutorialStep: 0,
  tutorialHint: '',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ArenaEngine | null>(null);

  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [phase, setPhase] = useState<GamePhase>('title');
  const [activeModal, setActiveModal] = useState<
    null | 'squad' | 'recruit' | 'events' | 'shop' | 'settings'
  >(null);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [boxScore, setBoxScore] = useState<MatchBoxScore | null>(null);
  const [matchConfig, setMatchConfig] = useState<MatchConfig>({
    mode: '1v1',
    durationSec: 180,
    ruleset: 'classic',
    arena: loadProfile().selectedArena,
    targetScore: 21,
    shotAssist: loadProfile().shotAssist,
  });

  // Persist profile changes cleanly
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore quota errors
    }
  }, [profile]);

  // Mirror game state to document.body.dataset.state for deterministic state tracking
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  const starterCards = useMemo(() => {
    return profile.starterIds
      .map((id) => {
        const base = PLAYER_ROSTER.find((p) => p.id === id);
        return base ? getEffectiveCard(base, profile.cardLevels[id] ?? 1) : null;
      })
      .filter((c): c is PlayerCard => c !== null);
  }, [profile.starterIds, profile.cardLevels]);

  const activeCoach = useMemo(
    () => COACHES.find((c) => c.id === profile.coachId) ?? COACHES[0],
    [profile.coachId]
  );

  const squadMetrics = useMemo(
    () => computeSquadMetrics(starterCards, activeCoach),
    [starterCards, activeCoach]
  );

  const unclaimedCount = useMemo(
    () => profile.missions.filter((m) => m.current >= m.target && !m.claimed).length,
    [profile.missions]
  );

  const handleMatchEnd = useCallback((result: MatchBoxScore) => {
    setBoxScore(result);
    setPhase('gameover');
    setProfile((prev) => {
      const nextXp = prev.xp + result.xpEarned;
      const nextLevel = Math.max(prev.level, 1 + Math.floor(nextXp / 400));
      const nextMissions = prev.missions.map((m) => {
        let delta = 0;
        if (m.metric === 'points') delta = result.pointsScored;
        else if (m.metric === 'threes') delta = result.threePointersMade;
        else if (m.metric === 'dunks') delta = result.dunks;
        else if (m.metric === 'blocks') delta = result.blocks + result.steals;
        else if (m.metric === 'wins' && result.won) delta = 1;
        else if (m.metric === 'matches') delta = 1;
        return { ...m, current: m.current + delta };
      });
      return {
        ...prev,
        coins: prev.coins + result.coinsEarned,
        gems: prev.gems + result.gemsEarned,
        xp: nextXp,
        level: nextLevel,
        rankPoints: Math.max(0, prev.rankPoints + (result.won ? 35 : -12)),
        matchesPlayed: prev.matchesPlayed + 1,
        matchesWon: prev.matchesWon + (result.won ? 1 : 0),
        missions: nextMissions,
      };
    });
  }, []);

  const callbacksRef = useRef({
    onHudUpdate: setHud,
    onMatchEnd: handleMatchEnd,
    onPauseRequested: () => {
      setPhase((curr) => {
        if (curr === 'playing') {
          engineRef.current?.setPaused(true);
          return 'paused';
        }
        if (curr === 'paused') {
          engineRef.current?.setPaused(false);
          return 'playing';
        }
        return curr;
      });
    },
  });

  useEffect(() => {
    callbacksRef.current.onHudUpdate = setHud;
    callbacksRef.current.onMatchEnd = handleMatchEnd;
  }, [handleMatchEnd]);

  // Mount isolated Three.js ArenaEngine once
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new ArenaEngine(
      canvasMountRef.current,
      starterCards,
      profile.selectedArena,
      {
        onHudUpdate: (snap) => callbacksRef.current.onHudUpdate(snap),
        onMatchEnd: (res) => callbacksRef.current.onMatchEnd(res),
        onPauseRequested: () => callbacksRef.current.onPauseRequested(),
      }
    );
    engineRef.current = engine;

    // ?autostart=1 support
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const oppPool = PLAYER_ROSTER.filter((p) => !profile.starterIds.includes(p.id)).slice(0, 3);
      setPhase('playing');
      engine.startMatch(
        { ...matchConfig, arena: profile.selectedArena, shotAssist: profile.shotAssist },
        starterCards,
        oppPool.length > 0 ? oppPool : PLAYER_ROSTER.slice(0, 3),
        profile.equippedJerseyOverride
      );
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartMatch = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveModal(null);
    setBoxScore(null);
    setPhase('playing');

    const opponents = PLAYER_ROSTER.filter((p) => !profile.starterIds.includes(p.id));
    const oppPool = opponents.length >= 3 ? opponents.slice(0, 3) : PLAYER_ROSTER.slice(1, 4);

    engineRef.current?.startMatch(
      { ...matchConfig, shotAssist: profile.shotAssist },
      starterCards,
      oppPool,
      profile.equippedJerseyOverride
    );
  }, [matchConfig, profile.starterIds, profile.shotAssist, profile.equippedJerseyOverride, starterCards]);

  // Title Enter/Space handshake + global Mute [M]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
        setMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
      }
      if (phase === 'title' && !activeModal && (e.code === 'Enter' || e.code === 'Space')) {
        if (
          e.target instanceof HTMLSelectElement ||
          e.target instanceof HTMLInputElement
        ) {
          return;
        }
        e.preventDefault();
        handleStartMatch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, activeModal, handleStartMatch]);

  const handleChangeConfig = (next: Partial<MatchConfig>) => {
    setMatchConfig((prev) => {
      const updated = { ...prev, ...next };
      if (next.arena && engineRef.current && phase === 'title') {
        engineRef.current.applyArenaTheme(next.arena);
        setProfile((p) => ({ ...p, selectedArena: next.arena! }));
      }
      return updated;
    });
  };

  const handleSwapStarter = (starterIdx: number, benchCardId: string) => {
    setProfile((prev) => {
      const nextStarters = [...prev.starterIds];
      nextStarters[starterIdx] = benchCardId;
      return { ...prev, starterIds: nextStarters };
    });
  };

  const handleTrainCard = (cardId: string) => {
    setProfile((prev) => {
      const currentLvl = prev.cardLevels[cardId] ?? 1;
      const cost = 250 * currentLvl;
      if (currentLvl >= 10 || prev.coins < cost) return prev;
      return {
        ...prev,
        coins: prev.coins - cost,
        cardLevels: { ...prev.cardLevels, [cardId]: currentLvl + 1 },
      };
    });
  };

  const handlePackPurchased = (
    pack: PackDefinition,
    drawnCard: PlayerCard,
    payWithGems: boolean
  ) => {
    setProfile((prev) => {
      const coins = payWithGems ? prev.coins : prev.coins - pack.costCoins;
      const gems = payWithGems && pack.costGems ? prev.gems - pack.costGems : prev.gems;
      const alreadyOwned = prev.ownedCardIds.includes(drawnCard.id);
      const nextOwned = alreadyOwned ? prev.ownedCardIds : [...prev.ownedCardIds, drawnCard.id];
      const nextLevels = { ...prev.cardLevels };
      if (alreadyOwned) {
        nextLevels[drawnCard.id] = Math.min(10, (nextLevels[drawnCard.id] ?? 1) + 1);
      } else {
        nextLevels[drawnCard.id] = 1;
      }
      return {
        ...prev,
        coins: Math.max(0, coins),
        gems: Math.max(0, gems),
        ownedCardIds: nextOwned,
        cardLevels: nextLevels,
      };
    });
  };

  const handleClaimMission = (missionId: string) => {
    setProfile((prev) => {
      const target = prev.missions.find((m) => m.id === missionId);
      if (!target || target.claimed || target.current < target.target) return prev;
      soundEngine.playPackReveal(false);
      return {
        ...prev,
        coins: prev.coins + target.rewardCoins,
        gems: prev.gems + target.rewardGems,
        missions: prev.missions.map((m) =>
          m.id === missionId ? { ...m, claimed: true } : m
        ),
      };
    });
  };

  const handleBuyCosmetic = (item: CosmeticItem) => {
    setProfile((prev) => {
      if (prev.coins < item.priceCoins || prev.unlockedCosmetics.includes(item.id)) {
        return prev;
      }
      const nextArenas = item.themeId
        ? Array.from(new Set([...prev.unlockedArenas, item.themeId]))
        : prev.unlockedArenas;
      return {
        ...prev,
        coins: prev.coins - item.priceCoins,
        unlockedCosmetics: [...prev.unlockedCosmetics, item.id],
        unlockedArenas: nextArenas,
        selectedArena: item.themeId ?? prev.selectedArena,
        equippedJerseyOverride:
          item.category === 'jersey' ? item.previewColor : prev.equippedJerseyOverride,
      };
    });
    if (item.themeId) {
      setMatchConfig((c) => ({ ...c, arena: item.themeId! }));
      engineRef.current?.applyArenaTheme(item.themeId);
    }
  };

  const handleEquipArena = (theme: ArenaTheme) => {
    setProfile((prev) => ({ ...prev, selectedArena: theme }));
    setMatchConfig((c) => ({ ...c, arena: theme }));
    engineRef.current?.applyArenaTheme(theme);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090B10]">
      {/* Dedicated Isolated 3D WebGL Canvas Mount */}
      <div
        ref={canvasMountRef}
        data-testid="arena-canvas"
        className="fixed inset-0 z-0"
      />

      {/* Title Screen */}
      {phase === 'title' && (
        <TitleOverlay
          profile={profile}
          teamOvr={squadMetrics.teamOvr}
          chemistry={squadMetrics.chemistry}
          unclaimedCount={unclaimedCount}
          config={matchConfig}
          onChangeConfig={handleChangeConfig}
          onStartMatch={handleStartMatch}
          onOpenModal={(m) => setActiveModal(m)}
        />
      )}

      {/* Active Gameplay HUD */}
      {(phase === 'playing' || phase === 'paused') && (
        <MatchHud
          hud={hud}
          mode={matchConfig.mode}
          muted={muted}
          controlScheme={profile.controlScheme}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            soundEngine.setMuted(next);
          }}
          onCycleCamera={() => engineRef.current?.cycleCamera()}
          onPause={() => {
            engineRef.current?.setPaused(true);
            setPhase('paused');
          }}
          onVirtualInput={(v) => engineRef.current?.setVirtualInput(v)}
          onCrossover={() => engineRef.current?.triggerCrossover()}
          onPassOrSwitch={() => engineRef.current?.triggerPassOrSwitch()}
          onStealOrContest={() => engineRef.current?.triggerStealOrContest()}
        />
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <PauseModal
          onResume={() => {
            engineRef.current?.setPaused(false);
            setPhase('playing');
          }}
          onRestart={handleStartMatch}
          onQuitToTitle={() => {
            engineRef.current?.returnToTitle(starterCards);
            setPhase('title');
          }}
        />
      )}

      {/* Post-Match Result Modal */}
      {phase === 'gameover' && boxScore && (
        <ResultModal
          boxScore={boxScore}
          onReplay={handleStartMatch}
          onOpenSquad={() => {
            engineRef.current?.returnToTitle(starterCards);
            setPhase('title');
            setActiveModal('squad');
          }}
          onBackToTitle={() => {
            engineRef.current?.returnToTitle(starterCards);
            setPhase('title');
          }}
        />
      )}

      {/* Dream Squad Modal */}
      {activeModal === 'squad' && (
        <DreamSquadModal
          profile={profile}
          onClose={() => setActiveModal(null)}
          onSwapStarter={handleSwapStarter}
          onSelectCoach={(coachId) => setProfile((p) => ({ ...p, coachId }))}
          onTrainCard={handleTrainCard}
        />
      )}

      {/* Pack Opening / Recruitment Modal */}
      {activeModal === 'recruit' && (
        <RecruitmentModal
          profile={profile}
          onClose={() => setActiveModal(null)}
          onPackPurchased={handlePackPurchased}
        />
      )}

      {/* Events / Shop / Settings Modal */}
      {(activeModal === 'events' || activeModal === 'shop' || activeModal === 'settings') && (
        <EventsShopModal
          initialTab={activeModal}
          profile={profile}
          onClose={() => setActiveModal(null)}
          onClaimMission={handleClaimMission}
          onBuyCosmetic={handleBuyCosmetic}
          onEquipArena={handleEquipArena}
          onUpdateSettings={(partial) =>
            setProfile((p) => ({ ...p, ...partial }))
          }
        />
      )}
    </main>
  );
}
