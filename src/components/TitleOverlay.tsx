import React from 'react';
import { Award, Calendar, ShoppingBag, Sliders, Sparkles, Users } from 'lucide-react';
import { ArenaTheme, MatchConfig, MatchMode, Ruleset, UserProfile } from '../game/types';

interface TitleOverlayProps {
  profile: UserProfile;
  teamOvr: number;
  chemistry: number;
  unclaimedCount: number;
  config: MatchConfig;
  onChangeConfig: (next: Partial<MatchConfig>) => void;
  onStartMatch: () => void;
  onOpenModal: (modal: 'squad' | 'recruit' | 'events' | 'shop' | 'settings') => void;
}

const MODE_OPTIONS: { id: MatchMode; label: string; desc: string }[] = [
  { id: '1v1', label: '1v1 Rapide', desc: 'Duel pur en 3 min' },
  { id: '3v3', label: '3v3 Triple Threat', desc: 'Action rapide 3 contre 3' },
  { id: '2v2', label: '2v2 Co-op Court', desc: 'Duo tactique pick & roll' },
  { id: 'ranked', label: 'Ranked Showdown', desc: 'Division compétitive' },
  { id: 'tutorial', label: 'Tutoriel 90s', desc: 'Dribble, tir vert & dunk' },
];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  profile,
  teamOvr,
  chemistry,
  unclaimedCount,
  config,
  onChangeConfig,
  onStartMatch,
  onOpenModal,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-5 sm:p-8 bg-gradient-to-r from-[#090B10]/90 via-[#090B10]/45 to-transparent">
      {/* Bottom contrast gradient for dock & control hint */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#090B10]/90 to-transparent -z-10" />
      {/* Top Safe Strip: Club Standing & Currencies (clean unboxed text + compact buttons) */}
      <div className="flex items-start justify-between gap-2.5 sm:gap-4">
        <div className="pointer-events-auto rounded-xl border border-white/12 bg-[#0B0E16]/88 px-3 sm:px-4 py-2 sm:py-2.5 min-w-0">
          <div className="text-[11px] sm:text-xs text-slate-400 truncate">
            {profile.clubName} · Division {profile.rankDivision} · Niv. {profile.level}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono-tabular text-xs sm:text-sm font-bold">
            <span className="text-amber-400 whitespace-nowrap">{profile.coins.toLocaleString('fr-FR')} HC</span>
            <span className="text-sky-300 whitespace-nowrap">{profile.gems.toLocaleString('fr-FR')} Gemmes</span>
            <span className="text-slate-200 whitespace-nowrap">
              Dream Squad {teamOvr} OVR · Chimie {chemistry}%
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenModal('settings')}
          aria-label="Paramètres et contrôles"
          className="pointer-events-auto shrink-0 flex items-center gap-2 rounded-xl border border-white/15 bg-[#0B0E16]/88 px-3 sm:px-3.5 py-2 sm:py-2.5 text-xs font-semibold text-slate-200 hover:text-amber-400 transition-colors whitespace-nowrap"
        >
          <Sliders className="w-4 h-4" />
          <span className="hidden sm:inline">Contrôles & Langue</span>
        </button>
      </div>

      {/* Main Left-Third Focal Lockup over Calm Negative Space */}
      <div className="my-auto max-w-xl pointer-events-auto">
        {/* Bespoke SVG Title Emblem */}
        <svg
          viewBox="0 0 460 118"
          className="w-full max-w-[420px] h-auto mb-3 drop-shadow-2xl"
          role="img"
          aria-label="Hoop Legends"
        >
          {/* Basketball Emblem Ring */}
          <g transform="translate(10, 14)">
            <circle cx="44" cy="44" r="38" fill="#EA580C" stroke="#F59E0B" strokeWidth="4" />
            <path d="M10 44 H78 M44 6 V82" stroke="#111827" strokeWidth="3" fill="none" />
            <path d="M22 14 C36 32, 36 56, 22 74" stroke="#111827" strokeWidth="3" fill="none" />
            <path d="M66 14 C52 32, 52 56, 66 74" stroke="#111827" strokeWidth="3" fill="none" />
          </g>
          {/* Athletic Condensed Lockup */}
          <text
            x="108"
            y="60"
            fill="#F8FAFC"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="58"
            letterSpacing="2"
          >
            HOOP
          </text>
          <text
            x="108"
            y="102"
            fill="#F59E0B"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="800"
            fontSize="50"
            letterSpacing="3"
          >
            LEGENDS
          </text>
        </svg>

        <p className="text-sm sm:text-base text-slate-200 max-w-md mb-5 leading-relaxed">
          Construis ton Dream Squad avec les stars d’hier et d’aujourd’hui, maîtrise le timing de tir et domine le parquet en 3D.
        </p>

        {/* Match Setup Card (Single Clean Surface, zero card-in-card clutter) */}
        <div className="rounded-2xl border border-white/15 bg-[#0B0E16]/90 p-4 shadow-2xl space-y-3.5">
          {/* Format Tabs */}
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-1.5">Format de match</div>
            <div className="flex flex-wrap gap-1.5">
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    onChangeConfig({
                      mode: m.id,
                      durationSec: m.id === 'tutorial' ? 90 : config.durationSec,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    config.mode === m.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rules, Duration & Arena Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-white/10">
            <div>
              <label htmlFor="match-duration" className="block text-[11px] text-slate-400 mb-1">
                Durée / Règles
              </label>
              <select
                id="match-duration"
                value={`${config.durationSec}-${config.ruleset}`}
                onChange={(e) => {
                  const [dur, rule] = e.target.value.split('-');
                  onChangeConfig({
                    durationSec: Number(dur),
                    ruleset: rule as Ruleset,
                  });
                }}
                className="w-full rounded-lg bg-[#141A29] border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <option value="180-classic">3 min · Classique</option>
                <option value="300-classic">5 min · Classique</option>
                <option value="300-arcade">Arcade · Premier à 21 pts</option>
              </select>
            </div>

            <div>
              <label htmlFor="match-arena" className="block text-[11px] text-slate-400 mb-1">
                Parquet / Arène
              </label>
              <select
                id="match-arena"
                value={config.arena}
                onChange={(e) => onChangeConfig({ arena: e.target.value as ArenaTheme })}
                className="w-full rounded-lg bg-[#141A29] border border-white/15 px-2.5 py-1.5 text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <option value="pro">Madison Pro Arena</option>
                <option
                  value="venice"
                  disabled={!profile.unlockedArenas.includes('venice')}
                >
                  Venice Sunset {!profile.unlockedArenas.includes('venice') ? '(Boutique)' : ''}
                </option>
                <option
                  value="tokyo"
                  disabled={!profile.unlockedArenas.includes('tokyo')}
                >
                  Tokyo Night {!profile.unlockedArenas.includes('tokyo') ? '(Boutique)' : ''}
                </option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                data-start="true"
                onClick={onStartMatch}
                className="w-full py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-xl font-extrabold tracking-wide transition-colors shadow-lg whitespace-nowrap"
              >
                JOUER
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Hub Dock: Dream Squad / Recrutement / Événements / Boutique + Control Hint */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-[#0B0E16]/90 p-1.5 shadow-xl">
          <button
            type="button"
            onClick={() => onOpenModal('squad')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Dream Squad</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('recruit')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>Recrutement</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('events')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>
              Événements{unclaimedCount > 0 ? ` (${unclaimedCount})` : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('shop')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <ShoppingBag className="w-4 h-4 text-rose-400" />
            <span>Boutique</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenModal('events')}
            className="hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <Award className="w-4 h-4 text-amber-300" />
            <span>Clan League</span>
          </button>
        </div>

        <div className="hidden sm:block text-xs text-slate-400 text-right">
          Entrée / Espace Jouer · ZQSD Déplacer · E Crossover · Maj Sprint · Échap Pause
        </div>
      </div>
    </div>
  );
};
