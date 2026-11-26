import React, { useRef } from 'react';
import { Camera, Pause, Volume2, VolumeX } from 'lucide-react';
import { VirtualInputState } from '../game/arenaScene';
import { ControlScheme, HudSnapshot, MatchMode } from '../game/types';

interface MatchHudProps {
  hud: HudSnapshot;
  mode: MatchMode;
  muted: boolean;
  controlScheme: ControlScheme;
  onToggleMute: () => void;
  onCycleCamera: () => void;
  onPause: () => void;
  onVirtualInput: (partial: Partial<VirtualInputState>) => void;
  onCrossover: () => void;
  onPassOrSwitch: () => void;
  onStealOrContest: () => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const MatchHud: React.FC<MatchHudProps> = ({
  hud,
  mode,
  muted,
  controlScheme,
  onToggleMute,
  onCycleCamera,
  onPause,
  onVirtualInput,
  onCrossover,
  onPassOrSwitch,
  onStealOrContest,
}) => {
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);
  const showTouchControls = controlScheme === 'touch';

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyOriginRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyOriginRef.current) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handleJoystickEnd = () => {
    joyOriginRef.current = null;
    onVirtualInput({ moveX: 0, moveZ: 0 });
  };

  const updateJoystick = (cx: number, cy: number) => {
    if (!joyOriginRef.current) return;
    const dx = (cx - joyOriginRef.current.x) / 42;
    const dy = (cy - joyOriginRef.current.y) / 42;
    const len = Math.hypot(dx, dy);
    const clampedX = len > 1 ? dx / len : dx;
    const clampedZ = len > 1 ? dy / len : dy;
    onVirtualInput({ moveX: clampedX, moveZ: clampedZ });
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
      {/* Top Row: Compact Broadcast Scorebug + Utility Controls */}
      <div className="flex items-start justify-between gap-4">
        <div className="hidden sm:block w-28" />

        {/* Center Broadcast Scorebug (solid rgba, zero backdrop-blur over WebGL) */}
        <div
          className="pointer-events-auto mx-auto flex items-center rounded-xl border border-white/15 bg-[#0B0E16]/90 shadow-2xl overflow-hidden"
          role="region"
          aria-label="Tableau des scores"
        >
          <div className="px-3.5 py-1.5 bg-amber-500 text-slate-950 flex items-center gap-2">
            <span className="font-display text-sm font-extrabold tracking-wide">VOUS</span>
            <span
              data-testid="player-score"
              className="font-display text-2xl font-extrabold tabular-nums leading-none"
            >
              {hud.playerScore}
            </span>
          </div>

          <div className="px-3.5 py-1 flex flex-col items-center justify-center min-w-[90px]">
            <span className="font-mono-tabular text-sm font-bold text-white leading-none">
              {formatClock(hud.timeRemaining)}
            </span>
            <span className="font-mono-tabular text-[11px] font-bold text-amber-400 mt-0.5">
              24s : {Math.ceil(hud.shotClock)}
            </span>
          </div>

          <div className="px-3.5 py-1.5 bg-rose-700 text-white flex items-center gap-2">
            <span
              data-testid="opponent-score"
              className="font-display text-2xl font-extrabold tabular-nums leading-none"
            >
              {hud.opponentScore}
            </span>
            <span className="font-display text-sm font-extrabold tracking-wide">RIVAL</span>
          </div>
        </div>

        {/* Top-Right Compact Icon Utilities */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
            title="Son [M]"
            className="w-10 h-10 rounded-lg border border-white/15 bg-[#0B0E16]/90 text-slate-200 hover:text-amber-400 flex items-center justify-center transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCamera();
            }}
            aria-label="Changer d'angle de caméra"
            title="Caméra [C]"
            className="w-10 h-10 rounded-lg border border-white/15 bg-[#0B0E16]/90 text-slate-200 hover:text-amber-400 flex items-center justify-center transition-colors"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Mettre en pause"
            title="Pause [Échap]"
            className="w-10 h-10 rounded-lg border border-white/15 bg-[#0B0E16]/90 text-slate-200 hover:text-amber-400 flex items-center justify-center transition-colors"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tutorial Guided Prompt (only in tutorial mode) */}
      {mode === 'tutorial' && hud.tutorialHint && (
        <div className="mx-auto mt-2 px-4 py-2 rounded-lg border border-amber-400/50 bg-[#0B0E16]/92 text-amber-200 text-sm font-medium text-center max-w-lg shadow-lg">
          Tutoriel {hud.tutorialStep + 1}/5 · {hud.tutorialHint}
        </div>
      )}

      {/* Center-Top Play-by-Play Feedback Callout & Shot Release Timing Meter */}
      <div className="flex-1 relative flex items-center justify-center">
        {hud.shotFeedback && (
          <div
            key={hud.shotFeedback.id}
            className={`absolute top-8 px-5 py-2 rounded-lg font-display text-2xl font-extrabold tracking-wide shadow-xl border ${
              hud.shotFeedback.tone === 'perfect'
                ? 'bg-emerald-600/95 border-emerald-300 text-white'
                : hud.shotFeedback.tone === 'dunk'
                  ? 'bg-amber-500/95 border-amber-200 text-slate-950'
                  : hud.shotFeedback.tone === 'defense'
                    ? 'bg-sky-600/95 border-sky-300 text-white'
                    : 'bg-[#0B0E16]/95 border-white/20 text-slate-200'
            }`}
          >
            {hud.shotFeedback.text}
          </div>
        )}

        {/* Dynamic Shot Release Meter (visible only while charging a shot) */}
        {hud.isShooting && (
          <div
            aria-label="Jauge de tir"
            className="absolute right-[18%] sm:right-[24%] top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5"
          >
            <span className="font-display text-xs font-bold tracking-wider text-white drop-shadow">
              RELÂCHER
            </span>
            <div className="relative w-5 h-36 rounded-full bg-[#090B10]/95 border-2 border-white/30 overflow-hidden shadow-xl">
              {/* Green sweet-spot zone */}
              <div
                className="absolute left-0 right-0 bg-emerald-400/85"
                style={{
                  bottom: `${(hud.shotSweetSpot - 0.08) * 100}%`,
                  height: '16%',
                }}
              />
              {/* Current charge fill */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-amber-400 transition-none"
                style={{ height: `${Math.min(100, hud.shotMeterRatio * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Perimeter: Active Player Stamina + Touch Controls if enabled */}
      <div className="flex items-end justify-between gap-4">
        {showTouchControls ? (
          <div
            className="pointer-events-auto w-28 h-28 rounded-full border-2 border-white/25 bg-[#0B0E16]/80 flex items-center justify-center touch-none"
            onPointerDown={handleJoystickStart}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickEnd}
            onPointerCancel={handleJoystickEnd}
            aria-label="Joystick virtuel"
          >
            <div className="w-11 h-11 rounded-full bg-amber-500/85 border border-amber-200" />
          </div>
        ) : (
          <div className="rounded-xl border border-white/15 bg-[#0B0E16]/90 px-4 py-2.5 min-w-[210px]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-lg font-bold text-white leading-none">
                #{hud.activePlayerNumber} {hud.activePlayerName}
              </span>
              <span className="font-mono-tabular text-xs font-bold text-amber-400">
                {hud.activePlayerOvr} OVR{hud.isOnFire ? ' · FEU' : ''}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  hud.stamina > 30 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${hud.stamina}%` }}
              />
            </div>
          </div>
        )}

        {/* Right Controls: Touch Action Buttons OR Compact Key Hint */}
        {showTouchControls ? (
          <div className="pointer-events-auto grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCrossover}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/95 border border-white/20 text-xs font-bold text-white active:scale-95"
            >
              DRIBBLE
            </button>
            <button
              type="button"
              onClick={onPassOrSwitch}
              className="px-3.5 py-2.5 rounded-xl bg-sky-600/95 border border-sky-300/40 text-xs font-bold text-white active:scale-95"
            >
              PASSE
            </button>
            <button
              type="button"
              onClick={onStealOrContest}
              className="px-3.5 py-2.5 rounded-xl bg-rose-600/95 border border-rose-300/40 text-xs font-bold text-white active:scale-95"
            >
              VOL / DEF
            </button>
            <button
              type="button"
              onPointerDown={() => onVirtualInput({ shootHeld: true })}
              onPointerUp={() => onVirtualInput({ shootHeld: false })}
              onPointerCancel={() => onVirtualInput({ shootHeld: false })}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500 border border-amber-200 text-xs font-extrabold text-slate-950 active:scale-95"
            >
              TIR / DUNK
            </button>
          </div>
        ) : (
          <div className="hidden md:block rounded-lg border border-white/10 bg-[#0B0E16]/85 px-3.5 py-1.5 text-xs text-slate-300">
            ZQSD Déplacer · Maj Sprint · E Crossover · Espace Tir / Dunk / Contre · R Passe · F Vol
          </div>
        )}
      </div>
    </div>
  );
};
