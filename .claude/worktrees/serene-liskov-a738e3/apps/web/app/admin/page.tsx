'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

/* ── Mini bar chart SVG ──────────────────────────────────────── */
function BarChart({ data, color = '#B87333' }: { data: { label: string; value: number }[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 100, H = 40;

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
            <rect x={x} y={y} width={bw} height={bh}
              fill={color} opacity={alpha} rx={1} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Gauge ring ──────────────────────────────────────────────── */
function Gauge({ pct, color = '#B87333', size = 64 }: { pct: number; color?: string; size?: number }) {
  const r  = 26;
  const c  = 2 * Math.PI * r;
  const p  = Math.min(Math.max(pct, 0), 100);
  const ds = c - (p / 100) * c;

  return (
    <svg width={size} height={size} viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={5} />
      <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={c} strokeDashoffset={ds}
        strokeLinecap="round" transform="rotate(-90 30 30)"
        style={{ transition: 'stroke-dashoffset .6s ease' }} />
      <text x="30" y="35" textAnchor="middle" fill={color}
        style={{ fontSize: 12, fontFamily: "'Cinzel',serif", fontWeight: 700 }}>
        {p}%
      </text>
    </svg>
  );
}

/* ── KPI Card ────────────────────────────────────────────────── */
function KPI({ label, value, sub, highlight, chart, gauge }: {
  label: string; value: string | number; sub?: string;
  highlight?: boolean; chart?: { label: string; value: number }[]; gauge?: number;
}) {
  return (
    <div style={{
      background: '#0A0A0A',
      border: `1px solid ${highlight ? 'rgba(184,115,51,.4)' : 'rgba(255,255,255,.04)'}`,
      borderRadius: 14, padding: 22,
      transition: 'border-color .25s, transform .25s',
      position: 'relative' as const, overflow: 'hidden',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(184,115,51,.35)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = highlight ? 'rgba(184,115,51,.4)' : 'rgba(255,255,255,.04)'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
    >
      {highlight && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(to bottom,#B87333,#D4A853)' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 10 }}>
            {label}
          </div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 900, color: highlight ? '#D4A853' : '#F0EDE8', lineHeight: 1.1 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 13, color: sub.startsWith('+') ? '#5BB85B' : sub.startsWith('▼') ? '#C0392B' : '#5A5248', marginTop: 6 }}>
              {sub}
            </div>
          )}
        </div>
        {gauge !== undefined && <Gauge pct={gauge} />}
      </div>

      {chart && chart.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <BarChart data={chart} />
        </div>
      )}
    </div>
  );
}

/* ── Status badge ────────────────────────────────────────────── */
function Badge({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11,
      background: ok ? 'rgba(91,184,91,.1)' : 'rgba(212,168,83,.1)',
      color: ok ? '#5BB85B' : '#D4A853',
      border: `1px solid ${ok ? 'rgba(91,184,91,.2)' : 'rgba(212,168,83,.2)'}`,
      fontFamily: "'Cinzel',serif", letterSpacing: 1,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? '#5BB85B' : '#D4A853', display: 'inline-block', animation: ok ? 'none' : 'pulse 1.6s infinite' }} />
      {ok ? 'ATIVO' : 'ONBOARDING'}
    </span>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const { token } = useAuth();
  const [data, setData]       = useState<any>(null);
  const [newSubs, setNewSubs] = useState<any[]>([]);
  const [error, setError]     = useState('');
  const [tick, setTick]       = useState(0);

  useEffect(() => {
    if (!token) return;
    const load = () => {
      api('/admin/dashboard', { token }).then(setData).catch(e => setError(e.message));
      api('/admin/dashboard/new-subs', { token }).then(setNewSubs).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [token]);

  // live clock
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
        <div>
          <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 8 }}>
            VISÃO GERAL
          </p>
          <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: '#F0EDE8', lineHeight: 1 }}>
            Dashboard
          </h1>
          <div style={{ width: 40, height: 2, background: '#B87333', marginTop: 10 }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 18, fontWeight: 700, color: '#B87333', letterSpacing: 2 }}>{timeStr}</div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 13, color: '#5A5248', marginTop: 2, textTransform: 'capitalize' as const }}>{dateStr}</div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: 'rgba(192,57,43,.1)', border: '1px solid rgba(192,57,43,.3)', borderRadius: 8, color: '#C0392B', marginBottom: 24, fontFamily: "'Cormorant Garamond',serif" }}>
          Erro ao carregar dados: {error}
        </div>
      )}

      {!data ? (
        /* Skeleton */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 14 }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── KPIs primários ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <KPI label="Assinantes Ativos" value={data.activePatients} sub={`+ ${data.newPatients30d} nos últimos 30 dias`} highlight />
            <KPI label="MRR" value={`R$ ${(data.mrr || 0).toLocaleString('pt-BR')}`} sub="Receita mensal recorrente" highlight />
            <KPI label="ARR" value={`R$ ${(data.arr || 0).toLocaleString('pt-BR')}`} sub="Projetado anual" highlight />
          </div>

          {/* ── KPIs operacionais ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            <KPI label="Mensagens Hoje" value={data.msgsToday} gauge={data.deliveryRate} sub={`Taxa de entrega: ${data.deliveryRate}%`} />
            <KPI label="Confirmação de Doses" value={`${data.confirmRate}%`} gauge={data.confirmRate} sub="Taxa de adesão hoje" />
            <KPI label="Churn (30 dias)" value={`${data.churnRate}%`} sub={data.churnRate > 5 ? '▼ Acima do ideal' : 'Dentro do esperado'} />
          </div>

          {/* ── Seção inferior ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Novos assinantes — gráfico de barras */}
            <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, padding: 24 }}>
              <p style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 6 }}>
                NOVOS ASSINANTES — 7 DIAS
              </p>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 22, fontWeight: 700, color: '#F0EDE8', marginBottom: 16 }}>
                {newSubs.reduce((s: number, d: any) => s + Number(d.count), 0)}
              </div>
              <BarChart data={newSubs.map((d: any) => ({
                label: d.day,
                value: Number(d.count),
              }))} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {newSubs.slice(-7).map((d: any, i: number) => (
                  <div key={i} style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 10, color: '#5A5248', textAlign: 'center' as const, flex: 1 }}>
                    {new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </div>
                ))}
              </div>
            </div>

            {/* Status geral */}
            <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, padding: 24 }}>
              <p style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 20 }}>
                STATUS OPERACIONAL
              </p>
              {[
                { label: 'Assinantes pagantes', value: data.activePatients, icon: '◉' },
                { label: 'Em onboarding', value: data.onboardingPending, icon: '◈' },
                { label: 'Ticket médio', value: 'R$ 149', icon: '◉' },
                { label: 'Churn últimos 30d', value: `${data.churnRate}%`, icon: '◈' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,.04)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#B87333', fontSize: 12 }}>{item.icon}</span>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#998E82' }}>{item.label}</span>
                  </div>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: '#F0EDE8' }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
