import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function RadarSvgCanvas({ children }: Props) {
  return (
    <svg viewBox="0 0 400 340" role="img" aria-label="Elite Command Radar">
      <defs>
        <radialGradient id="radarGlow" cx="50%" cy="48%" r="60%">
          <stop offset="0%" stopColor="#1B2436" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#080B12" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sweepGrad" x1="200" y1="165" x2="200" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5CE72" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F5CE72" stopOpacity="0" />
        </linearGradient>
        <marker id="arrowNone" />
      </defs>

      <circle cx="200" cy="165" r="165" fill="url(#radarGlow)" />

      <circle cx="200" cy="165" r="70" fill="none" stroke="rgba(232,184,75,0.16)" strokeDasharray="1 5" />
      <circle cx="200" cy="165" r="112" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="1 5" />
      <circle cx="200" cy="165" r="155" fill="none" stroke="rgba(232,184,75,0.14)" />

      <g className="sweep-group">
        <line x1="200" y1="165" x2="200" y2="10" stroke="url(#sweepGrad)" strokeWidth="2.5" />
        <animateTransform attributeName="transform" type="rotate" from="0 200 165" to="360 200 165" dur="9s" repeatCount="indefinite" />
      </g>

      <text x="200" y="86" textAnchor="middle" className="zone-label">CORE</text>
      <text x="200" y="320" textAnchor="middle" className="zone-label zone-label-outer">WATCHLIST RING</text>

      <line x1="200" y1="140" x2="200" y2="217" className="link-line" />

      {children}
    </svg>
  );
}
