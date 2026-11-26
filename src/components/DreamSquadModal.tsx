import React, { useState } from 'react';
import { ArrowLeftRight, BrainCircuit, TrendingUp, X } from 'lucide-react';
import { computeSquadMetrics } from '../game/physics';
import { COACHES, getEffectiveCard, PLAYER_ROSTER } from '../game/playersData';
import { PlayerCard as PlayerCardType, UserProfile } from '../game/types';
import { PlayerCard } from './PlayerCard';

interface DreamSquadModalProps {
  profile: UserProfile;
  onClose: () => void;
  onSwapStarter: (starterIdx: number, benchCardId: string) => void;
  onSelectCoach: (coachId: string) => void;
  onTrainCard: (cardId: string) => void;
}

export const DreamSquadModal: React.FC<DreamSquadModalProps> = ({
  profile,
  onClose,
  onSwapStarter,
  onSelectCoach,
  onTrainCard,
}) => {
  const [selectedStarterSlot, setSelectedStarterSlot] = useState<number | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string>(profile.starterIds[0]);

  // Gemini Tactical Coach state
  const [question, setQuestion] = useState('');
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const ownedCards: PlayerCardType[] = profile.ownedCardIds
    .map((id) => {
      const base = PLAYER_ROSTER.find((p) => p.id === id);
      if (!base) return null;
      return getEffectiveCard(base, profile.cardLevels[id] ?? 1);
    })
    .filter((c): c is PlayerCardType => c !== null);

  const starters = profile.starterIds
    .map((id) => ownedCards.find((c) => c.id === id))
    .filter((c): c is PlayerCardType => c !== undefined);

  const bench = ownedCards.filter((c) => !profile.starterIds.includes(c.id));
  const activeCoach = COACHES.find((c) => c.id === profile.coachId) ?? COACHES[0];
  const metrics = computeSquadMetrics(starters, activeCoach);
  const focusedCard = ownedCards.find((c) => c.id === focusedCardId) ?? starters[0];
  const trainCost = focusedCard ? 250 * focusedCard.level : 250;

  const handleAskCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoadingAdvice(true);
    setAdviceError(null);
    setAdvice(null);
    try {
      const res = await fetch('/api/coach-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          starters: starters.map((s) => ({
            name: s.name,
            position: s.position,
            ovr: s.ovr,
            role: s.role,
          })),
          coachStyle: activeCoach.styleLabel,
          opponentFocus: 'Match classé compétitif',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdviceError(data.error || 'Impossible de contacter le Coach Tactique.');
      } else {
        setAdvice(data.advice);
      }
    } catch {
      setAdviceError('Erreur réseau lors de la requête au Coach Tactique.');
    } finally {
      setLoadingAdvice(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Gestion Dream Squad"
    >
      <div className="w-full max-w-6xl max-h-[92vh] rounded-2xl border border-white/15 bg-[#0D111A] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-3xl font-extrabold text-white tracking-wide">
              DREAM SQUAD
            </h2>
            <p className="text-xs text-slate-400">
              Cinq majeur · Chimie tactique · Entraînement · Coach IA · {profile.coins.toLocaleString('fr-FR')} HC disponibles
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer Dream Squad"
            className="w-10 h-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Team Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-xl border border-white/10 bg-[#121826] p-4">
            <div>
              <div className="text-xs text-slate-400">Note Équipe</div>
              <div className="font-display text-3xl font-extrabold text-amber-400 tabular-nums">
                {metrics.teamOvr}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Chimie</div>
              <div className="font-display text-3xl font-extrabold text-emerald-400 tabular-nums">
                {metrics.chemistry}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Attaque</div>
              <div className="font-display text-3xl font-extrabold text-white tabular-nums">
                {metrics.attackRating}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Défense</div>
              <div className="font-display text-3xl font-extrabold text-white tabular-nums">
                {metrics.defenseRating}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Rythme</div>
              <div className="font-display text-3xl font-extrabold text-sky-300 tabular-nums">
                {metrics.paceRating}
              </div>
            </div>
          </div>

          {/* 5-Man Starting Lineup */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xl font-bold text-white">
                Cinq Majeur (Cliquez pour sélectionner ou échanger)
              </h3>
              {selectedStarterSlot !== null && (
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Sélectionnez un joueur du banc ci-dessous pour remplacer le poste #{selectedStarterSlot + 1}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {starters.map((card, idx) => (
                <PlayerCard
                  key={card.id}
                  card={card}
                  isStarter
                  selected={selectedStarterSlot === idx || focusedCardId === card.id}
                  onClick={() => {
                    setFocusedCardId(card.id);
                    setSelectedStarterSlot(selectedStarterSlot === idx ? null : idx);
                  }}
                />
              ))}
            </div>
          </section>

          {/* Two-Column Split: Bench + Training & Coach Tactics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Bench / Collection */}
            <div className="lg:col-span-7 space-y-3">
              <h3 className="font-display text-xl font-bold text-white">
                Banc & Réserve ({bench.length})
              </h3>
              {bench.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#121826] p-6 text-sm text-slate-400">
                  Votre banc est vide pour le moment. Ouvrez des packs dans Recrutement pour élargir votre rotation.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {bench.map((card) => (
                    <PlayerCard
                      key={card.id}
                      card={card}
                      compact
                      selected={focusedCardId === card.id}
                      onClick={() => {
                        setFocusedCardId(card.id);
                        if (selectedStarterSlot !== null) {
                          onSwapStarter(selectedStarterSlot, card.id);
                          setSelectedStarterSlot(null);
                        }
                      }}
                      actionLabel={
                        selectedStarterSlot !== null ? 'Titulariser' : 'Inspecter'
                      }
                      onAction={(e) => {
                        e.stopPropagation();
                        if (selectedStarterSlot !== null) {
                          onSwapStarter(selectedStarterSlot, card.id);
                          setSelectedStarterSlot(null);
                        } else {
                          setFocusedCardId(card.id);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Card Training + Coach System + AI Tactician */}
            <div className="lg:col-span-5 space-y-5">
              {/* Card Training Box */}
              {focusedCard && (
                <div className="rounded-xl border border-white/12 bg-[#121826] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">Entraînement de carte</div>
                      <div className="font-display text-xl font-bold text-white">
                        {focusedCard.name} · Niv. {focusedCard.level}/{focusedCard.maxLevel}
                      </div>
                    </div>
                    <TrendingUp className="w-5 h-5 text-amber-400" />
                  </div>
                  <p className="text-xs text-slate-300">
                    Signature : {focusedCard.signatureMove} · Badges : {focusedCard.badges.join(' / ')}
                  </p>
                  <button
                    type="button"
                    disabled={
                      focusedCard.level >= focusedCard.maxLevel || profile.coins < trainCost
                    }
                    onClick={() => onTrainCard(focusedCard.id)}
                    className="w-full py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    {focusedCard.level >= focusedCard.maxLevel
                      ? 'Niveau Maximum Atteint'
                      : `Entraîner (+1 Toutes Stats) · ${trainCost} HC`}
                  </button>
                </div>
              )}

              {/* Coach Tactical Selector */}
              <div className="rounded-xl border border-white/12 bg-[#121826] p-4 space-y-2.5">
                <div className="text-xs text-slate-400">Système Tactique du Coach</div>
                <div className="grid grid-cols-2 gap-2">
                  {COACHES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectCoach(c.id)}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        profile.coachId === c.id
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-white/10 bg-[#0D111A] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-xs font-bold">{c.styleLabel}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                        +{c.boostAmount}{' '}
                        {c.boostStat === 'threePoint'
                          ? 'Tir 3PTS'
                          : c.boostStat === 'defense'
                            ? 'Défense'
                            : c.boostStat === 'pass'
                              ? 'Passe'
                              : 'Vitesse'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tactical Coach Assistant (Gemini 4 Thinking Mode) */}
              <div className="rounded-xl border border-white/12 bg-[#121826] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-amber-400" />
                  <h4 className="font-display text-lg font-bold text-white">
                    Analyste Tactique Avancé
                  </h4>
                </div>
                <form onSubmit={handleAskCoach} className="space-y-2">
                  <label htmlFor="coach-question" className="sr-only">
                    Question tactique pour votre lineup
                  </label>
                  <input
                    id="coach-question"
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ex: Comment optimiser mon 5 contre une défense physique ?"
                    className="w-full rounded-lg bg-[#090B10] border border-white/15 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={loadingAdvice || !question.trim()}
                    className="w-full py-2 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    {loadingAdvice ? 'Analyse tactique en cours...' : 'Analyser mon Lineup'}
                  </button>
                </form>
                {adviceError && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-200">
                    {adviceError}
                  </div>
                )}
                {advice && (
                  <div className="rounded-lg border border-emerald-500/30 bg-[#0B0E16] p-3 text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                    {advice}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
