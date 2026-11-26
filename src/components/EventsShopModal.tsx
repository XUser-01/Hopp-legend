import React, { useState } from 'react';
import { Check, Gamepad2, X } from 'lucide-react';
import { CLAN_LEADERBOARD, COSMETIC_ITEMS } from '../game/playersData';
import { ArenaTheme, ControlScheme, CosmeticItem, Language, UserProfile } from '../game/types';

interface EventsShopModalProps {
  initialTab: 'events' | 'shop' | 'settings';
  profile: UserProfile;
  onClose: () => void;
  onClaimMission: (missionId: string) => void;
  onBuyCosmetic: (item: CosmeticItem) => void;
  onEquipArena: (theme: ArenaTheme) => void;
  onUpdateSettings: (partial: {
    controlScheme?: ControlScheme;
    shotAssist?: boolean;
    passAssist?: boolean;
    language?: Language;
  }) => void;
}

export const EventsShopModal: React.FC<EventsShopModalProps> = ({
  initialTab,
  profile,
  onClose,
  onClaimMission,
  onBuyCosmetic,
  onEquipArena,
  onUpdateSettings,
}) => {
  const [tab, setTab] = useState<'events' | 'shop' | 'settings'>(initialTab);
  const [confirmItem, setConfirmItem] = useState<CosmeticItem | null>(null);
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    return Array.from(navigator.getGamepads()).some((g) => g !== null);
  });

  const refreshGamepad = () => {
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      setGamepadConnected(Array.from(navigator.getGamepads()).some((g) => g !== null));
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Événements, Boutique et Paramètres"
    >
      <div className="w-full max-w-5xl max-h-[90vh] rounded-2xl border border-white/15 bg-[#0D111A] flex flex-col overflow-hidden shadow-2xl">
        {/* Header + Tab Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#131926] border border-white/10">
            <button
              type="button"
              onClick={() => setTab('events')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === 'events' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              Événements & Clan
            </button>
            <button
              type="button"
              onClick={() => setTab('shop')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === 'shop' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              Boutique & Courts
            </button>
            <button
              type="button"
              onClick={() => setTab('settings')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                tab === 'settings' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              Contrôles & Langue
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="font-mono-tabular text-xs font-bold text-slate-200">
              <span className="text-amber-400">{profile.coins.toLocaleString('fr-FR')} HC</span> ·{' '}
              <span className="text-sky-300">{profile.gems} Gemmes</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-10 h-10 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'events' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Missions */}
              <div className="lg:col-span-7 space-y-3">
                <h3 className="font-display text-2xl font-bold text-white">
                  Défis Quotidiens & Événements Live
                </h3>
                {profile.missions.map((m) => {
                  const pct = Math.min(100, Math.round((m.current / m.target) * 100));
                  const ready = m.current >= m.target && !m.claimed;
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl border border-white/10 bg-[#121826] p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 space-y-1.5">
                        <div className="text-xs text-amber-400 font-semibold">
                          {m.category === 'daily'
                            ? 'Quotidien'
                            : m.category === 'weekly'
                              ? 'Événement Hebdo'
                              : 'Événement Légende'}{' '}
                          · +{m.rewardCoins} HC · +{m.rewardGems} Gemmes
                        </div>
                        <div className="font-display text-lg font-bold text-white">{m.title}</div>
                        <div className="text-xs text-slate-400">{m.description}</div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <div className="font-mono-tabular text-xs text-slate-300">
                          {Math.min(m.current, m.target)} / {m.target}
                        </div>
                        {m.claimed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Reçu
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!ready}
                            onClick={() => onClaimMission(m.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold transition-colors"
                          >
                            Récupérer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Clan League Leaderboard */}
              <div className="lg:col-span-5 space-y-3">
                <h3 className="font-display text-2xl font-bold text-white">
                  Classement Clan League
                </h3>
                <div className="rounded-xl border border-white/10 bg-[#121826] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Clan</th>
                        <th className="py-2.5 px-3 text-right">Bilan</th>
                        <th className="py-2.5 px-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {CLAN_LEADERBOARD.map((row) => (
                        <tr
                          key={row.rank}
                          className={row.isPlayer ? 'bg-amber-500/10 text-amber-200' : 'text-slate-200'}
                        >
                          <td className="py-2.5 px-3 font-mono-tabular font-bold">{row.rank}</td>
                          <td className="py-2.5 px-3 font-medium">
                            {row.clan} · {row.region}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-400">
                            {row.record}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-bold">
                            {row.points.toLocaleString('fr-FR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#121826] p-4 text-xs text-slate-300 space-y-1">
                  <div className="font-bold text-white">Pass Saisonnier Gratuit</div>
                  <p>
                    Progression : Niveau {profile.level} · {profile.matchesWon} victoires. Chaque match remplit votre Pass sans aucun paywall compétitif.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'shop' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-display text-2xl font-bold text-white">
                  Boutique Cosmétique Responsable
                </h3>
                <p className="text-xs text-slate-400">
                  Terrains et tenues cosmétiques uniquement — aucun avantage Pay-to-Win sur le parquet.
                </p>
              </div>

              {confirmItem && (
                <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-white">
                    Confirmer l’achat de <strong>{confirmItem.name}</strong> pour{' '}
                    <span className="font-mono-tabular text-amber-300">
                      {confirmItem.priceCoins} HC
                    </span>{' '}
                    ?
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmItem(null)}
                      className="px-3.5 py-1.5 rounded-lg border border-white/20 text-xs text-slate-200"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onBuyCosmetic(confirmItem);
                        setConfirmItem(null);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold"
                    >
                      Confirmer l’achat
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {COSMETIC_ITEMS.map((item) => {
                  const owned = profile.unlockedCosmetics.includes(item.id);
                  const equipped =
                    item.themeId && profile.selectedArena === item.themeId;

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/12 bg-[#121826] p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-xl shrink-0 border border-white/15"
                          style={{ backgroundColor: item.previewColor }}
                        />
                        <div>
                          <div className="font-display text-xl font-bold text-white">
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-400">{item.description}</div>
                        </div>
                      </div>

                      {owned ? (
                        item.themeId ? (
                          <button
                            type="button"
                            disabled={!!equipped}
                            onClick={() => onEquipArena(item.themeId!)}
                            className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 disabled:opacity-60 text-emerald-200 text-xs font-bold whitespace-nowrap"
                          >
                            {equipped ? 'Équipé' : 'Équiper'}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
                            Débloqué
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={profile.coins < item.priceCoins}
                          onClick={() => setConfirmItem(item)}
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 text-xs font-bold whitespace-nowrap"
                        >
                          {item.priceCoins} HC
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="max-w-2xl space-y-5">
              <h3 className="font-display text-2xl font-bold text-white">
                Contrôles, Assistance & Langue
              </h3>

              <div className="rounded-xl border border-white/10 bg-[#121826] p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300">Mode de contrôle</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'keyboard', label: 'Clavier / Souris' },
                      { id: 'touch', label: 'Tactile Mobile' },
                      { id: 'gamepad', label: 'Manette Bluetooth' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdateSettings({ controlScheme: opt.id })}
                      className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-colors ${
                        profile.controlScheme === opt.id
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#090B10] text-slate-300 border border-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-sky-400" />
                    Manette détectée : {gamepadConnected ? 'Oui (Prête)' : 'Aucune'}
                  </span>
                  <button
                    type="button"
                    onClick={refreshGamepad}
                    className="text-amber-400 hover:underline"
                  >
                    Vérifier
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121826] p-4 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white">Assistance au Tir</div>
                    <div className="text-xs text-slate-400">
                      Élargit la fenêtre verte de release pour des tirs fluides sur mobile.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.shotAssist}
                    onChange={(e) => onUpdateSettings({ shotAssist: e.target.checked })}
                    className="w-5 h-5 accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Passe Assistée</div>
                    <div className="text-xs text-slate-400">
                      Cible automatiquement le coéquipier le mieux démarqué.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.passAssist}
                    onChange={(e) => onUpdateSettings({ passAssist: e.target.checked })}
                    className="w-5 h-5 accent-amber-500"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121826] p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Langue de l’interface</div>
                  <div className="text-xs text-slate-400">Français / English</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ language: 'fr' })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      profile.language === 'fr' ? 'bg-amber-500 text-slate-950' : 'bg-[#090B10] text-slate-300'
                    }`}
                  >
                    FR
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ language: 'en' })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      profile.language === 'en' ? 'bg-amber-500 text-slate-950' : 'bg-[#090B10] text-slate-300'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
