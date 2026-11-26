import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { soundEngine } from '../game/audio';
import { rollCardFromPack } from '../game/physics';
import { PACKS, PLAYER_ROSTER } from '../game/playersData';
import { PackDefinition, PlayerCard as PlayerCardType, UserProfile } from '../game/types';
import { PlayerCard } from './PlayerCard';

interface RecruitmentModalProps {
  profile: UserProfile;
  onClose: () => void;
  onPackPurchased: (pack: PackDefinition, drawnCard: PlayerCardType, payWithGems: boolean) => void;
}

export const RecruitmentModal: React.FC<RecruitmentModalProps> = ({
  profile,
  onClose,
  onPackPurchased,
}) => {
  const [revealedCard, setRevealedCard] = useState<PlayerCardType | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const handleOpenPack = (pack: PackDefinition, payWithGems = false) => {
    if (payWithGems && (!pack.costGems || profile.gems < pack.costGems)) return;
    if (!payWithGems && profile.coins < pack.costCoins) return;

    setIsOpening(true);
    setRevealedCard(null);

    const card = rollCardFromPack(
      pack,
      PLAYER_ROSTER,
      profile.ownedCardIds,
      Math.random(),
      Math.random()
    );

    setTimeout(() => {
      setIsOpening(false);
      setRevealedCard(card);
      soundEngine.playPackReveal(card.tier === 'legende');
      onPackPurchased(pack, card, payWithGems);
    }, 450);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Recrutement de Joueurs"
    >
      <div className="w-full max-w-5xl max-h-[90vh] rounded-2xl border border-white/15 bg-[#0D111A] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-3xl font-extrabold text-white tracking-wide">
              RECRUTEMENT & PACKS
            </h2>
            <p className="text-xs text-slate-400">
              Probabilités transparentes · {profile.coins.toLocaleString('fr-FR')} HC ·{' '}
              {profile.gems.toLocaleString('fr-FR')} Gemmes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer Recrutement"
            className="w-10 h-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Revealed Pack Showcase */}
          {(isOpening || revealedCard) && (
            <div className="rounded-2xl border border-amber-400/40 bg-[#121826] p-6 flex flex-col items-center text-center space-y-4">
              {isOpening ? (
                <div className="py-10 space-y-2">
                  <Sparkles className="w-10 h-10 text-amber-400 mx-auto" />
                  <div className="font-display text-2xl font-bold text-white">
                    Signature du contrat en cours...
                  </div>
                </div>
              ) : (
                revealedCard && (
                  <>
                    <div className="text-xs font-semibold text-amber-400">
                      NOUVELLE RECRUE AJOUTÉE À VOTRE DREAM SQUAD
                    </div>
                    <div className="w-60">
                      <PlayerCard card={revealedCard} />
                    </div>
                    <p className="text-xs text-slate-300 max-w-md">
                      {revealedCard.name} ({revealedCard.team}) · Signature : {revealedCard.signatureMove}
                    </p>
                  </>
                )
              )}
            </div>
          )}

          {/* Available Packs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PACKS.map((pack) => {
              const canCoins = profile.coins >= pack.costCoins;
              const canGems = pack.costGems ? profile.gems >= pack.costGems : false;

              return (
                <div
                  key={pack.id}
                  className="rounded-2xl border border-white/12 bg-[#121826] p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div
                      className="h-1.5 w-14 rounded-full"
                      style={{ backgroundColor: pack.accentColor }}
                    />
                    <h3 className="font-display text-2xl font-extrabold text-white">
                      {pack.name}
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{pack.subtitle}</p>

                    {/* Transparent Drop Rates */}
                    <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
                      <div className="text-[11px] font-semibold text-slate-400">
                        Probabilités de tirage affichées
                      </div>
                      <div className="flex justify-between text-amber-400 font-mono-tabular">
                        <span>Légende Or (97–99)</span>
                        <span>{Math.round(pack.probabilities.legende * 100)}%</span>
                      </div>
                      <div className="flex justify-between text-sky-300 font-mono-tabular">
                        <span>Diamant (94–96)</span>
                        <span>{Math.round(pack.probabilities.diamant * 100)}%</span>
                      </div>
                      <div className="flex justify-between text-rose-300 font-mono-tabular">
                        <span>Rubis (93–94)</span>
                        <span>{Math.round(pack.probabilities.rubis * 100)}%</span>
                      </div>
                      <div className="flex justify-between text-emerald-300 font-mono-tabular">
                        <span>Émeraude (90–92)</span>
                        <span>{Math.round(pack.probabilities.emeraude * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      disabled={!canCoins || isOpening}
                      onClick={() => handleOpenPack(pack, false)}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-bold text-xs transition-colors"
                    >
                      Recruter · {pack.costCoins.toLocaleString('fr-FR')} HC
                    </button>

                    {pack.costGems && (
                      <button
                        type="button"
                        disabled={!canGems || isOpening}
                        onClick={() => handleOpenPack(pack, true)}
                        className="w-full py-2 px-4 rounded-xl border border-sky-400/40 bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-40 text-sky-200 font-semibold text-xs transition-colors"
                      >
                        Ouvrir avec {pack.costGems} Gemmes
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
