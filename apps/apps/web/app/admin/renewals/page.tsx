'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

function UrgencyBadge({ days }: { days: number }) {
  const color  = days <= 3 ? '#C0392B' : days <= 15 ? '#D4A853' : '#5BB85B';
  const bg     = days <= 3 ? 'rgba(192,57,43,.1)' : days <= 15 ? 'rgba(212,168,83,.1)' : 'rgba(91,184,91,.1)';
  const border = days <= 3 ? 'rgba(192,57,43,.3)' : days <= 15 ? 'rgba(212,168,83,.3)' : 'rgba(91,184,91,.3)';
  const label  = days <= 3 ? 'URGENTE' : days <= 15 ? 'ATENÇÃO' : 'NORMAL';
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2 }}>
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 20, fontWeight: 900, color }}>{days}</span>
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 2, color: '#5A5248' }}>DIAS</span>
      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 9, background: bg, border: `1px solid ${border}`, color, fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>
        {label}
      </span>
    </div>
  );
}

export default function RenewalsPage() {
  const { token } = useAuth();
  const [renewals, setRenewals]   = useState<any[]>([]);
  const [sending, setSending]     = useState<string | null>(null);
  const [feedback, setFeedback]   = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!token) return;
    api('/admin/renewals', { token })
      .then(d => setRenewals(d.renewals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const sendReminder = async (subId: string, name: string) => {
    if (!token) return;
    setSending(subId);
    try {
      await api(`/admin/renewals/${subId}/remind`, { method: 'POST', token });
      setFeedback(f => ({ ...f, [subId]: '✓ Enviado' }));
    } catch {
      setFeedback(f => ({ ...f, [subId]: '✗ Erro' }));
    } finally { setSending(null); }
  };

  const urgente  = renewals.filter(r => Number(r.days_remaining) <= 3);
  const atencao  = renewals.filter(r => Number(r.days_remaining) > 3 && Number(r.days_remaining) <= 15);
  const normal   = renewals.filter(r => Number(r.days_remaining) > 15);

  return (
    <>
      <style>{`
        .remind-btn{background:linear-gradient(135deg,#B87333,#D4A853);color:#000;padding:8px 18px;border-radius:4px;font-family:'Cinzel',serif;font-size:9px;letter-spacing:3px;font-weight:700;border:none;cursor:pointer;transition:all .2s;white-space:nowrap;}
        .remind-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 12px rgba(184,115,51,.3);}
        .remind-btn:disabled{opacity:.5;cursor:not-allowed;}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 8 }}>ASSINATURAS</p>
        <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>Renovações</h1>
        <div style={{ width: 40, height: 2, background: '#B87333', marginTop: 10, marginBottom: 6 }} />
        <p style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 15 }}>
          Assinaturas vencendo nos próximos 30 dias
        </p>
      </div>

      {/* Contadores */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Urgentes (≤3 dias)',   count: urgente.length, color: '#C0392B', bg: 'rgba(192,57,43,.08)' },
            { label: 'Atenção (4–15 dias)',  count: atencao.length, color: '#D4A853', bg: 'rgba(212,168,83,.08)' },
            { label: 'Normal (16–30 dias)',  count: normal.length,  color: '#5BB85B', bg: 'rgba(91,184,91,.08)' },
          ].map(stat => (
            <div key={stat.label} style={{ background: stat.bg, border: `1px solid ${stat.color}22`, borderRadius: 12, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 36, fontWeight: 900, color: stat.color }}>{stat.count}</span>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#998E82', textTransform: 'uppercase' as const, lineHeight: 1.6 }}>{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 10, borderRadius: 8 }} />)}
          </div>
        ) : renewals.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' as const, fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 16 }}>
            Nenhuma assinatura vencendo nos próximos 30 dias.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Paciente', 'Telefone', 'Plano', 'Vencimento', 'Prazo', 'Ação'].map(h => (
                  <th key={h} style={{ textAlign: 'left' as const, padding: '14px 20px', fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5A5248', textTransform: 'uppercase' as const, fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renewals.map((r: any, i: number) => {
                const days = Math.round(Number(r.days_remaining));
                const fb   = feedback[r.sub_id];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <td style={{ padding: '14px 20px', fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 600, color: '#F0EDE8' }}>
                      {r.full_name}
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: 'monospace', fontSize: 12, color: '#5A5248' }}>
                      {r.phone}
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: "'Cinzel',serif", fontSize: 13, color: '#D4A853' }}>
                      R$ {(Number(r.amount_cents) / 100).toFixed(0)}
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 14, color: '#998E82' }}>
                      {new Date(r.expires_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <UrgencyBadge days={days} />
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {fb ? (
                        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: fb.startsWith('✓') ? '#5BB85B' : '#C0392B', letterSpacing: 2 }}>{fb}</span>
                      ) : (
                        <button className="remind-btn" disabled={sending === r.sub_id}
                          onClick={() => sendReminder(r.sub_id, r.full_name)}>
                          {sending === r.sub_id ? 'ENVIANDO...' : 'LEMBRETE'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
