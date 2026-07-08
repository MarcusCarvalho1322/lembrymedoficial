'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

function RevenueBar({ label, valueCents, maxCents }: { label: string; valueCents: number; maxCents: number }) {
  const pct   = maxCents > 0 ? Math.round((valueCents / maxCents) * 100) : 0;
  const value = (valueCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#998E82' }}>{label}</span>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, fontWeight: 700, color: '#D4A853' }}>{value}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: 'linear-gradient(90deg,#B87333,#D4A853)',
          transition: 'width .6s ease',
        }} />
      </div>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#0A0A0A', border: '1px solid rgba(184,115,51,.2)', borderRadius: 14, padding: 24, position: 'relative' as const, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(to bottom,#B87333,#D4A853)' }} />
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 30, fontWeight: 900, color: '#D4A853' }}>{value}</div>
      {sub && <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function RevenuePage() {
  const { token } = useAuth();
  const [data, setData]       = useState<any>(null);
  const [revenue, setRevenue] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    api('/admin/dashboard', { token }).then(setData).catch(() => {});
    api('/admin/dashboard/revenue', { token }).then(setRevenue).catch(() => {});
  }, [token]);

  const maxCents = revenue.length > 0 ? Math.max(...revenue.map((r: any) => Number(r.total_cents))) : 1;

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${months[Number(mo) - 1]}/${y}`;
  };

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 8 }}>FINANCEIRO</p>
        <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>Receita</h1>
        <div style={{ width: 40, height: 2, background: '#B87333', marginTop: 10 }} />
      </div>

      {!data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[...Array(3)].map((_,i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
            <KPI label="MRR" value={`R$ ${(data.mrr || 0).toLocaleString('pt-BR')}`} sub="Receita mensal recorrente" />
            <KPI label="ARR" value={`R$ ${(data.arr || 0).toLocaleString('pt-BR')}`} sub="Projeção anual" />
            <KPI label="Ticket Médio" value="R$ 149" sub={`${data.activePatients} assinantes ativos`} />
          </div>

          {/* Gráfico de barras mensal */}
          <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, padding: 28, marginBottom: 20 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 24 }}>
              EVOLUÇÃO MENSAL — ÚLTIMOS 6 MESES
            </div>
            {revenue.length === 0 ? (
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 15 }}>Nenhum dado disponível.</div>
            ) : (
              revenue.map((r: any, i: number) => (
                <RevenueBar key={i} label={fmtMonth(r.month)} valueCents={Number(r.total_cents)} maxCents={maxCents} />
              ))
            )}
          </div>

          {/* Tabela detalhada */}
          <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const }}>
                DETALHAMENTO POR MÊS
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  {['Mês', 'Assinaturas', 'Receita Bruta', 'Ticket Médio'].map(h => (
                    <th key={h} style={{ textAlign: 'left' as const, padding: '12px 20px', fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5A5248', textTransform: 'uppercase' as const, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenue.map((r: any, i: number) => {
                  const bruto  = (Number(r.total_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  const ticket = r.count > 0 ? (Number(r.total_cents) / 100 / Number(r.count)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
                  return (
                    <tr key={i}>
                      <td style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cinzel',serif", fontSize: 13, color: '#F0EDE8' }}>
                        {fmtMonth(r.month)}
                      </td>
                      <td style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cinzel',serif", fontSize: 16, fontWeight: 700, color: '#998E82' }}>
                        {r.count}
                      </td>
                      <td style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: '#D4A853' }}>
                        {bruto}
                      </td>
                      <td style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#5A5248' }}>
                        {ticket}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
