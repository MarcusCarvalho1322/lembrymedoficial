'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface QueueCounts {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface QueueData {
  reminders: QueueCounts;
  familyAlerts: QueueCounts;
  delivery: {
    sent_24h: number;
    failed_24h: number;
    confirmed_24h: number;
    denied_24h: number;
    delivery_rate: number | null;
    confirm_rate: number | null;
  };
  circuit_breaker: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    openedAt?: string;
  };
}

interface ReminderError {
  id: string;
  patient_name: string;
  patient_phone: string;
  medication_name: string;
  dosage: string;
  reminder_type: string;
  medication_time: string;
  scheduled_for: string;
  error_message: string;
  created_at: string;
}

interface FunnelRow {
  onboarding_step: string;
  count: string;
  last_7d: string;
}

interface FunnelData {
  funnel: FunnelRow[];
  stuck_count: number;
}

// ─── Componentes primitivos ───────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#0A0A0A',
      border: '1px solid rgba(255,255,255,.04)',
      borderRadius: 14,
      padding: 24,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Cinzel',serif",
      fontSize: 9,
      letterSpacing: 4,
      color: '#5A5248',
      textTransform: 'uppercase',
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function StatBox({
  label, value, color = '#D4A853', sub,
}: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div style={{
      background: '#0A0A0A',
      border: '1px solid rgba(255,255,255,.04)',
      borderRadius: 14,
      padding: 20,
      textAlign: 'center',
      transition: 'border-color .25s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(184,115,51,.25)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,.04)'; }}
    >
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5A5248', textTransform: 'uppercase', marginTop: 8 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 11, color: '#5A5248', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
    }}>
      <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#5A5248' }}>{label}</span>
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: '#D4A853' }}>{value}</span>
    </div>
  );
}

function CircuitBadge({ state, failures, openedAt }: QueueData['circuit_breaker']) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    CLOSED:    { bg: 'rgba(91,184,91,.1)',   text: '#5BB85B', border: 'rgba(91,184,91,.25)' },
    OPEN:      { bg: 'rgba(192,57,43,.15)',  text: '#C0392B', border: 'rgba(192,57,43,.35)' },
    HALF_OPEN: { bg: 'rgba(212,168,83,.1)',  text: '#D4A853', border: 'rgba(212,168,83,.35)' },
  };
  const c = colors[state] ?? colors.CLOSED;
  const labels: Record<string, string> = {
    CLOSED: 'Operacional',
    OPEN: 'Circuito Aberto',
    HALF_OPEN: 'Recuperando',
  };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: '6px 14px',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.text, display: 'inline-block' }} />
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 2, color: c.text }}>
        WHATSAPP API — {labels[state] ?? state}
      </span>
      {failures > 0 && (
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 12, color: c.text }}>
          ({failures} falhas)
        </span>
      )}
    </div>
  );
}

// ─── Painel: Erros com reenvio ─────────────────────────────────────────────────

function ErrorsPanel({ token }: { token: string }) {
  const [errors, setErrors]   = useState<ReminderError[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<Set<string>>(new Set());
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api<{ errors: ReminderError[] }>('/admin/queue/errors?limit=30', { token })
      .then(d => { setErrors(d.errors); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const resend = async (id: string) => {
    setResending(prev => new Set(prev).add(id));
    try {
      await api('/admin/queue/resend', {
        token, method: 'POST',
        body: JSON.stringify({ reminder_log_id: id }),
      });
      setToast({ msg: 'Lembrete reenviado com sucesso', ok: true });
      load();
    } catch (e: any) {
      setToast({ msg: e.message || 'Erro ao reenviar', ok: false });
    } finally {
      setResending(prev => { const s = new Set(prev); s.delete(id); return s; });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const reminderLabel: Record<string, string> = {
    initial: 'Inicial',
    t_plus_10: 'T+10 Confirmação',
    t_plus_5: 'T+5 Legado',
    t_plus_30: 'T+30 Familiar',
    t_minus_60: 'T-60 Antecipado',
    t_minus_15: 'T-15 Antecipado',
  };

  return (
    <Card style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <SectionLabel>Envios com Falha — Últimos 30</SectionLabel>
        <button onClick={load} style={{
          background: 'none', border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
          fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 2, color: '#5A5248',
        }}>
          RECARREGAR
        </button>
      </div>

      {toast && (
        <div style={{
          marginBottom: 12, padding: '10px 16px', borderRadius: 8,
          background: toast.ok ? 'rgba(91,184,91,.1)' : 'rgba(192,57,43,.1)',
          border: `1px solid ${toast.ok ? 'rgba(91,184,91,.25)' : 'rgba(192,57,43,.25)'}`,
          fontFamily: "'Cormorant Garamond',serif", fontSize: 14,
          color: toast.ok ? '#5BB85B' : '#C0392B',
        }}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 14, color: '#5A5248', textAlign: 'center', padding: 24 }}>
          Carregando…
        </div>
      ) : errors.length === 0 ? (
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 14, color: '#5A5248', textAlign: 'center', padding: 24 }}>
          Nenhum envio com falha nos últimos registros.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' as const }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Paciente', 'Medicamento', 'Tipo', 'Horário', 'Erro', 'Data', ''].map(h => (
                  <th key={h} style={{
                    fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 3,
                    color: '#5A5248', textTransform: 'uppercase',
                    padding: '0 8px 12px', textAlign: 'left', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map(err => (
                <tr key={err.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                  <td style={{ padding: '12px 8px', fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#998E82', whiteSpace: 'nowrap' }}>
                    {err.patient_name}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#998E82' }}>
                    <div>{err.medication_name}</div>
                    <div style={{ fontSize: 11, color: '#5A5248' }}>{err.dosage}</div>
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1, color: '#B87333', whiteSpace: 'nowrap' }}>
                    {reminderLabel[err.reminder_type] ?? err.reminder_type}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#5A5248', whiteSpace: 'nowrap' }}>
                    {err.medication_time?.slice(0, 5) ?? '—'}
                  </td>
                  <td style={{ padding: '12px 8px', maxWidth: 220 }}>
                    <div style={{
                      fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic',
                      fontSize: 12, color: '#C0392B',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={err.error_message}>
                      {err.error_message}
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: "'Cormorant Garamond',serif", fontSize: 12, color: '#5A5248', whiteSpace: 'nowrap' }}>
                    {new Date(err.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <button
                      onClick={() => resend(err.id)}
                      disabled={resending.has(err.id)}
                      style={{
                        background: resending.has(err.id) ? 'rgba(184,115,51,.05)' : 'rgba(184,115,51,.1)',
                        border: '1px solid rgba(184,115,51,.3)',
                        borderRadius: 6, padding: '5px 12px', cursor: resending.has(err.id) ? 'default' : 'pointer',
                        fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: 2,
                        color: resending.has(err.id) ? '#5A5248' : '#B87333',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {resending.has(err.id) ? 'ENVIANDO…' : 'REENVIAR'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Painel: Funil de onboarding ──────────────────────────────────────────────

function FunnelPanel({ token }: { token: string }) {
  const [data, setData] = useState<FunnelData | null>(null);

  useEffect(() => {
    api<FunnelData>('/admin/onboarding-funnel', { token })
      .then(setData)
      .catch(() => {});
  }, [token]);

  const stepLabels: Record<string, string> = {
    start:             'Início',
    collecting_meds:   'Coletando medicamentos',
    meds_confirmed:    'Medicamentos confirmados',
    collecting_family: 'Coletando familiar',
    active:            'Ativo',
  };

  const stepColors: Record<string, string> = {
    start:             '#5A5248',
    collecting_meds:   '#B87333',
    meds_confirmed:    '#D4A853',
    collecting_family: '#B87333',
    active:            '#5BB85B',
  };

  if (!data) {
    return (
      <Card style={{ marginTop: 24 }}>
        <SectionLabel>Funil de Onboarding</SectionLabel>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 14, color: '#5A5248', textAlign: 'center', padding: 16 }}>
          Carregando…
        </div>
      </Card>
    );
  }

  const maxCount = Math.max(...data.funnel.map(r => Number(r.count)), 1);

  return (
    <Card style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <SectionLabel>Funil de Onboarding</SectionLabel>
        {data.stuck_count > 0 && (
          <div style={{
            background: 'rgba(192,57,43,.1)', border: '1px solid rgba(192,57,43,.3)',
            borderRadius: 6, padding: '5px 12px',
            fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 2, color: '#C0392B',
          }}>
            {data.stuck_count} PARADOS &gt;48H
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.funnel.map(row => {
          const count = Number(row.count);
          const pct = Math.round((count / maxCount) * 100);
          const color = stepColors[row.onboarding_step] ?? '#5A5248';
          return (
            <div key={row.onboarding_step}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#998E82' }}>
                  {stepLabels[row.onboarding_step] ?? row.onboarding_step}
                </span>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 12, color: '#5A5248' }}>
                    +{row.last_7d} esta semana
                  </span>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color }}>
                    {count}
                  </span>
                </div>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,.04)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function QueuePage() {
  const { token } = useAuth();
  const [data, setData]     = useState<QueueData | null>(null);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const load = () => {
      api<QueueData>('/admin/queue', { token })
        .then(d => { setData(d); setLastAt(new Date()); setError(null); })
        .catch(e => setError(e.message));
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [token]);

  const cb = data?.circuit_breaker;
  const cbDegraded = cb && cb.state !== 'CLOSED';

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .skeleton { background: linear-gradient(90deg,#111 25%,#1a1a1a 50%,#111 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase', marginBottom: 8 }}>
            SISTEMA
          </p>
          <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>
            Fila de Envios
          </h1>
          <div style={{ width: 40, height: 2, background: '#B87333', marginTop: 10 }} />
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: error ? '#C0392B' : '#5BB85B',
              display: 'inline-block',
              animation: 'pulse 1.6s infinite',
            }} />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: error ? '#C0392B' : '#5BB85B' }}>
              {error ? 'ERRO DE CONEXÃO' : 'AUTO-REFRESH 5s'}
            </span>
          </div>
          {cb && <CircuitBadge {...cb} />}
          {lastAt && (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 12, color: '#5A5248' }}>
              Atualizado: {lastAt.toLocaleTimeString('pt-BR')}
            </div>
          )}
        </div>
      </div>

      {cbDegraded && (
        <div style={{
          marginBottom: 20, padding: '14px 20px',
          background: 'rgba(192,57,43,.08)', border: '1px solid rgba(192,57,43,.25)',
          borderRadius: 10,
          fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#C0392B',
        }}>
          ⚠ Circuit Breaker {cb.state === 'OPEN' ? 'ABERTO' : 'EM RECUPERAÇÃO'} —
          {cb.openedAt
            ? ` Aberto às ${new Date(cb.openedAt).toLocaleTimeString('pt-BR')}.`
            : ''} {cb.failures} falhas registradas. WhatsApp temporariamente suspenso.
        </div>
      )}

      {!data ? (
        /* Skeleton */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
            {[...Array(5)].map((_,i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
            {[...Array(5)].map((_,i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
            <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />
          </div>
        </div>
      ) : (
        <>
          {/* Fila: Lembretes */}
          <Card style={{ marginBottom: 16 }}>
            <SectionLabel>Fila de Lembretes — send-reminder</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
              <StatBox label="Aguardando"   value={data.reminders.waiting}   color="#D4A853" sub="na fila" />
              <StatBox label="Ativos"       value={data.reminders.active}    color="#B87333" sub="processando" />
              <StatBox label="Atrasados"    value={data.reminders.delayed}   color="#998E82" sub="scheduled" />
              <StatBox label="Concluídos"   value={data.reminders.completed} color="#5BB85B" sub="últimos 100" />
              <StatBox label="Com Falha"    value={data.reminders.failed}    color="#C0392B" sub="últimos 200" />
            </div>
          </Card>

          {/* Fila: Alertas de Familiar */}
          <Card style={{ marginBottom: 24 }}>
            <SectionLabel>Fila de Alertas — family-alert</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
              <StatBox label="Aguardando"   value={data.familyAlerts.waiting}   color="#D4A853" sub="na fila" />
              <StatBox label="Ativos"       value={data.familyAlerts.active}    color="#B87333" sub="processando" />
              <StatBox label="Atrasados"    value={data.familyAlerts.delayed}   color="#998E82" sub="scheduled" />
              <StatBox label="Concluídos"   value={data.familyAlerts.completed} color="#5BB85B" sub="últimos 100" />
              <StatBox label="Com Falha"    value={data.familyAlerts.failed}    color="#C0392B" sub="últimos 200" />
            </div>
          </Card>

          {/* Métricas + Ações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Métricas das últimas 24h */}
            <Card>
              <SectionLabel>Métricas — Últimas 24 horas</SectionLabel>
              <MetricRow label="Lembretes enviados"     value={data.delivery.sent_24h} />
              <MetricRow label="Confirmações recebidas" value={data.delivery.confirmed_24h} />
              <MetricRow label="Negativas recebidas"    value={data.delivery.denied_24h} />
              <MetricRow label="Falhas de envio"        value={data.delivery.failed_24h} />
              <MetricRow
                label="Taxa de entrega"
                value={data.delivery.delivery_rate !== null ? `${data.delivery.delivery_rate}%` : '—'}
              />
              <div style={{ borderTop: 'none' }}>
                <MetricRow
                  label="Taxa de confirmação"
                  value={data.delivery.confirm_rate !== null ? `${data.delivery.confirm_rate}%` : '—'}
                />
              </div>
            </Card>

            {/* Ações rápidas */}
            <Card>
              <SectionLabel>Ações de Manutenção</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ActionButton
                  label="Limpar Jobs Falhos"
                  description="Remove até 100 jobs em estado 'failed' de ambas as filas"
                  color="#C0392B"
                  onClick={async () => {
                    await api('/admin/queue/clean-failed', { token: token!, method: 'POST' });
                  }}
                />
                <ActionButton
                  label="Drenar Todas as Filas"
                  description="Remove TODOS os jobs (waiting, active, delayed, failed). Use apenas em desenvolvimento."
                  color="#8B0000"
                  dangerous
                  onClick={async () => {
                    if (!confirm('⚠ Isso remove TODOS os jobs das filas. Confirmar?')) return;
                    await api('/admin/queue/drain-all', { token: token!, method: 'POST' });
                  }}
                />
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Erros com reenvio */}
      {token && <ErrorsPanel token={token} />}

      {/* Funil de onboarding */}
      {token && <FunnelPanel token={token} />}
    </>
  );
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({
  label, description, color, dangerous = false, onClick,
}: {
  label: string;
  description: string;
  color: string;
  dangerous?: boolean;
  onClick: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  const handle = async () => {
    setLoading(true);
    try {
      await onClick();
      setToast({ msg: 'Operação concluída', ok: true });
    } catch (e: any) {
      setToast({ msg: e.message || 'Erro na operação', ok: false });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div>
      <button
        onClick={handle}
        disabled={loading}
        style={{
          width: '100%', textAlign: 'left',
          background: `rgba(${hexToRgb(color)},.06)`,
          border: `1px solid rgba(${hexToRgb(color)},.2)`,
          borderRadius: 8, padding: '12px 16px', cursor: loading ? 'default' : 'pointer',
          transition: 'border-color .2s',
        }}
        onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.borderColor = `rgba(${hexToRgb(color)},.45)`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `rgba(${hexToRgb(color)},.2)`; }}
      >
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 2, color, marginBottom: 4 }}>
          {loading ? 'EXECUTANDO…' : label}
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 12, color: '#5A5248' }}>
          {description}
        </div>
      </button>
      {toast && (
        <div style={{
          marginTop: 6, padding: '7px 12px', borderRadius: 6,
          background: toast.ok ? 'rgba(91,184,91,.1)' : 'rgba(192,57,43,.1)',
          fontFamily: "'Cormorant Garamond',serif", fontSize: 13,
          color: toast.ok ? '#5BB85B' : '#C0392B',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
