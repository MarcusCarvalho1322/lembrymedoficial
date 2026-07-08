/**
 * Charts e células visuais compartilhadas entre páginas admin.
 *
 * Onda 4 / B1: extraído para reduzir duplicação entre admin/page.tsx
 * e admin/patient/[phone]/page.tsx (Gauge estava em ambos, com tamanhos
 * ligeiramente diferentes — agora aceita prop `size`).
 */

import React from 'react';

// ─── BarChart SVG ───────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  color = '#B87333',
}: {
  data: BarDatum[];
  color?: string;
}) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 100;
  const H = 40;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 48 }}>
      {data.map((d, i) => {
        const bw    = W / data.length - 2;
        const bh    = (d.value / max) * (H - 8);
        const x     = i * (W / data.length) + 1;
        const y     = H - bh;
        const alpha = 0.3 + (d.value / max) * 0.7;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill={color} opacity={alpha} rx={1} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Gauge SVG ──────────────────────────────────────────────────────────────

export function Gauge({
  pct,
  color,
  size = 64,
}: {
  pct: number;
  /** Cor da linha. Se omitido, escolhe automaticamente por threshold (verde/amber/vermelho). */
  color?: string;
  size?: number;
}) {
  const r  = 26;
  const c  = 2 * Math.PI * r;
  const p  = Math.min(Math.max(pct, 0), 100);
  const ds = c - (p / 100) * c;
  const effectiveColor =
    color ?? (p >= 75 ? '#5BB85B' : p >= 50 ? '#D4A853' : '#C0392B');

  return (
    <svg width={size} height={size} viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={5} />
      <circle
        cx="30" cy="30" r={r}
        fill="none" stroke={effectiveColor} strokeWidth={5}
        strokeDasharray={c} strokeDashoffset={ds}
        strokeLinecap="round" transform="rotate(-90 30 30)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text
        x="30" y="35" textAnchor="middle" fill={effectiveColor}
        style={{ fontSize: 12, fontFamily: "'Cinzel',serif", fontWeight: 700 }}
      >
        {p}%
      </text>
    </svg>
  );
}

// ─── ConfirmationCell ───────────────────────────────────────────────────────

export function ConfirmationCell({ status }: { status: string }) {
  const bg =
    status === 'confirmed'
      ? 'rgba(91,184,91,.25)'
      : status === 'denied'
      ? 'rgba(192,57,43,.2)'
      : 'rgba(255,255,255,.04)';
  const bd =
    status === 'confirmed'
      ? 'rgba(91,184,91,.5)'
      : status === 'denied'
      ? 'rgba(192,57,43,.5)'
      : 'rgba(255,255,255,.08)';
  const icon = status === 'confirmed' ? '✓' : status === 'denied' ? '✗' : '·';
  const color = status === 'confirmed' ? '#5BB85B' : status === 'denied' ? '#C0392B' : '#5A5248';
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: bg,
        border: `1px solid ${bd}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color,
        fontWeight: 700,
      }}
    >
      {icon}
    </div>
  );
}
