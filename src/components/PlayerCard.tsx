import React from 'react';
import { PlayerCard as PlayerCardType } from '../game/types';

interface PlayerCardProps {
  card: PlayerCardType;
  compact?: boolean;
  selected?: boolean;
  isStarter?: boolean;
  onClick?: () => void;
  actionLabel?: string;
  onAction?: (e: React.MouseEvent) => void;
}

const TIER_STYLES: Record<
  PlayerCardType['tier'],
  { border: string; accent: string; label: string; headerBg: string }
> = {
  legende: {
    border: 'border-amber-500/60',
    accent: 'text-amber-400',
    label: 'Légende Or',
    headerBg: 'bg-gradient-to-b from-amber-500/20 to-transparent',
  },
  diamant: {
    border: 'border-sky-400/55',
    accent: 'text-sky-300',
    label: 'Diamant',
    headerBg: 'bg-gradient-to-b from-sky-500/20 to-transparent',
  },
  rubis: {
    border: 'border-rose-500/55',
    accent: 'text-rose-400',
    label: 'Rubis',
    headerBg: 'bg-gradient-to-b from-rose-500/20 to-transparent',
  },
  emeraude: {
    border: 'border-emerald-500/55',
    accent: 'text-emerald-400',
    label: 'Émeraude',
    headerBg: 'bg-gradient-to-b from-emerald-500/20 to-transparent',
  },
};

function ProJerseyPortrait({ card }: { card: PlayerCardType }) {
  const { primaryColor, secondaryColor, jerseyNumber, shortName, badges } = card;
  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: `radial-gradient(circle at 55% 30%, ${primaryColor}CC 0%, #0D121E 68%, #080A10 100%)`,
      }}
    >
      {/* Subtle jersey mesh texture overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '6px 6px',
        }}
      />
      {/* Stylized Pro Jersey Silhouette */}
      <svg viewBox="0 0 180 180" className="w-32 h-32 -mt-4 drop-shadow-2xl" aria-hidden="true">
        <defs>
          <linearGradient id={`jgrad-${card.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor="#0B0F19" />
          </linearGradient>
        </defs>
        <path
          d="M42 26 L64 20 Q90 42 116 20 L138 26 L130 68 C134 78 140 82 142 158 L38 158 C40 82 46 78 50 68 Z"
          fill={`url(#jgrad-${card.id})`}
          stroke={secondaryColor}
          strokeWidth="3"
        />
        <path d="M64 20 Q90 45 116 20" fill="none" stroke={secondaryColor} strokeWidth="4" />
        <text
          x="90"
          y="74"
          textAnchor="middle"
          fill="#E2E8F0"
          fontFamily="Barlow Condensed, sans-serif"
          fontWeight="700"
          fontSize="13"
          letterSpacing="2"
        >
          {shortName}
        </text>
        <text
          x="90"
          y="128"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="Barlow Condensed, sans-serif"
          fontWeight="800"
          fontSize="58"
        >
          {jerseyNumber}
        </text>
      </svg>
    </div>
  );
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  card,
  compact = false,
  selected = false,
  isStarter = false,
  onClick,
  actionLabel,
  onAction,
}) => {
  const tier = TIER_STYLES[card.tier];

  return (
    <div
      className={`relative rounded-xl border bg-[#111622] overflow-hidden transition-transform duration-150 ${
        tier.border
      } ${selected ? 'ring-2 ring-amber-400 -translate-y-0.5' : ''} ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {/* Visual Header + Portrait */}
        <div className={`relative ${compact ? 'h-32' : 'h-44'} w-full bg-[#0B0E16] overflow-hidden`}>
          {card.portraitUrl ? (
            <img
              src={card.portraitUrl}
              alt={card.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <ProJerseyPortrait card={card} />
          )}

          {/* Measured dark bottom scrim for crisp legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#111622] via-black/25 to-transparent" />

          {/* Top-left OVR & Position */}
          <div className="absolute top-2.5 left-2.5 flex flex-col items-start leading-none">
            <span className={`font-display text-3xl font-extrabold tabular-nums drop-shadow ${tier.accent}`}>
              {card.ovr}
            </span>
            <span className="text-[11px] font-bold tracking-wider text-slate-200">
              {card.position} · #{card.jerseyNumber}
            </span>
          </div>

          {/* Top-right Starter indicator (text only, zero pill box) */}
          {isStarter && (
            <span className="absolute top-2.5 right-2.5 text-[11px] font-semibold text-amber-300">
              Titulaire
            </span>
          )}

          {/* Bottom Name & Metadata */}
          <div className="absolute bottom-2 left-2.5 right-2.5">
            <div className="font-display text-lg font-bold text-white leading-tight truncate">
              {card.name}
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              {card.team} · {tier.label} · Niv.{card.level}
            </div>
          </div>
        </div>

        {/* Key Attributes Grid */}
        <div className="p-2.5 grid grid-cols-4 gap-1.5 border-t border-white/10 text-center">
          <div>
            <div className="text-[10px] text-slate-400">3PT</div>
            <div className="font-mono-tabular text-xs font-bold text-slate-100">{card.stats.threePoint}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">DRI</div>
            <div className="font-mono-tabular text-xs font-bold text-slate-100">{card.stats.handle}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">DNK</div>
            <div className="font-mono-tabular text-xs font-bold text-slate-100">{card.stats.dunk}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">DEF</div>
            <div className="font-mono-tabular text-xs font-bold text-slate-100">{card.stats.defense}</div>
          </div>
        </div>
      </button>

      {actionLabel && onAction && (
        <div className="px-2.5 pb-2.5">
          <button
            type="button"
            onClick={onAction}
            className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};
