import React from 'react';
import { MatchBoxScore } from '../game/types';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onQuitToTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Match en pause"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0D111A] p-6 text-center space-y-5 shadow-2xl">
        <div>
          <h2 className="font-display text-4xl font-extrabold text-white tracking-wide">
            PAUSE
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Match suspendu · Appuyez sur Échap pour reprendre
          </p>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors"
          >
            Reprendre le match
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors"
          >
            Recommencer
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full py-2.5 px-4 rounded-xl border border-white/15 hover:bg-white/5 text-slate-300 font-semibold text-sm transition-colors"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    </div>
  );
};

interface ResultModalProps {
  boxScore: MatchBoxScore;
  onReplay: () => void;
  onOpenSquad: () => void;
  onBackToTitle: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  boxScore,
  onReplay,
  onOpenSquad,
  onBackToTitle,
}) => {
  const fgPct =
    boxScore.fieldGoalsAttempted > 0
      ? Math.round((boxScore.fieldGoalsMade / boxScore.fieldGoalsAttempted) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Résultat du match"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0D111A] p-6 space-y-5 shadow-2xl">
        <div className="text-center space-y-1">
          <div
            className={`text-xs font-bold tracking-wider ${
              boxScore.won ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {boxScore.won ? 'VICTOIRE · MVP ' + boxScore.mvpName : 'FIN DU MATCH'}
          </div>
          <h2 className="font-display text-5xl font-extrabold text-white tabular-nums">
            {boxScore.playerScore} — {boxScore.opponentScore}
          </h2>
        </div>

        {/* Box Score Metrics */}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-[#121826] p-4 text-center">
          <div>
            <div className="text-[11px] text-slate-400">Réussite</div>
            <div className="font-display text-2xl font-bold text-white tabular-nums">{fgPct}%</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">3 Points</div>
            <div className="font-display text-2xl font-bold text-sky-300 tabular-nums">
              {boxScore.threePointersMade}/{boxScore.threePointersAttempted}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Dunks · Contres</div>
            <div className="font-display text-2xl font-bold text-amber-400 tabular-nums">
              {boxScore.dunks} · {boxScore.blocks}
            </div>
          </div>
        </div>

        {/* Rewards */}
        <div className="grid grid-cols-3 gap-3 text-center rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div>
            <div className="text-[11px] text-amber-200">XP Gagné</div>
            <div className="font-mono-tabular text-base font-bold text-white">
              +{boxScore.xpEarned}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-amber-200">Hoop Coins</div>
            <div className="font-mono-tabular text-base font-bold text-amber-300">
              +{boxScore.coinsEarned} HC
            </div>
          </div>
          <div>
            <div className="text-[11px] text-amber-200">Gemmes</div>
            <div className="font-mono-tabular text-base font-bold text-sky-300">
              +{boxScore.gemsEarned}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onReplay}
            className="flex-1 py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-xl font-extrabold tracking-wide transition-colors"
          >
            REJOUER
          </button>
          <button
            type="button"
            onClick={onOpenSquad}
            className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors"
          >
            Dream Squad
          </button>
          <button
            type="button"
            onClick={onBackToTitle}
            className="py-2.5 px-4 rounded-xl border border-white/15 hover:bg-white/5 text-slate-300 text-xs font-semibold transition-colors"
          >
            Accueil
          </button>
        </div>
      </div>
    </div>
  );
};
