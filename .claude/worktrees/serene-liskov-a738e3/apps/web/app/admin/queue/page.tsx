'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

function QueueStat({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{
      background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)',
      borderRadius: 14, padding: 22, textAlign: 'center' as const,
      transition: 'border-color .25s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(184,115,51,.25)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,.04)'; }}
    >
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginTop: 8 }}>
        {label}
      </div>
      {sub && <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 12, color: '#5A5248', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function WorkerStatus({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: active ? '#5BB85B' : '#C0392B',
          display: 'inline-block',
          animation: active ? 'pulse 1.6s infinite' : 'none',
          boxShadow: active ? '0 0 6px rgba(91,184,91,.5)' : 'none',
        }} />
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#998E82' }}>{label}</span>
      </div>
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 2, color: active ? '#5BB85B' : '#C0392B' }}>
        {active ? 'ONLINE' : 'OFFLINE'}
      </span>
    </div>
  );
}

export default function QueuePage() {
  const { token } = useAuth();
  const [data, setData]     = useState<any>(null);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!token) return;
    const load = () => {
      api('/admin/queue', { token })
        .then(d => { setData(d); setLastAt(new Date()); })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [token]);

  return (
    <>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 8 }}>SISTEMA</p>
          <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>Fila de Envios</h1>
          <div style={{ width: 40, height: 2, background: '#B87333', marginTop: 10 }} />
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5BB85B', display: 'inline-block', animation: 'pulse 1.6s infinite' }} />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5BB85B' }}>AUTO-REFRESH 5s</span>
          </div>
          {lastAt && (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 12, color: '#5A5248', marginTop: 4 }}>
              Atualizado: {lastAt.toLocaleTimeString('pt-BR')}
            </div>
          )}
        </div>
      </div>

      {!data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 14 }} />)}
        </div>
      ) : (
        <>
          {/* Contadores BullMQ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            <QueueStat label="Aguardando" value={data.waiting}  color="#D4A853" sub="na fila" />
            <QueueStat label="Em progresso" value={data.active}   color="#B87333" sub="processando" />
            <QueueStat label="Concluídas"   value={data.completed} color="#5BB85B" sub="hoje" />
            <QueueStat label="Com falha"    value={data.failed}   color="#C0392B" sub="requer atenção" />
          </div>

          {/* Workers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 16 }}>
                STATUS DOS WORKERS
              </div>
              <WorkerStatus label="Reminder Scheduler" active={data.workers?.scheduler ?? true} />
              <WorkerStatus label="Reminder Sender"    active={data.workers?.sender    ?? true} />
              <WorkerStatus label="Family Alerter"     active={data.workers?.alerter   ?? true} />
              <WorkerStatus label="Onboarding Nudge"   active={data.workers?.nudge     ?? true} />
              <WorkerStatus label="Lifecycle Worker"   active={data.workers?.lifecycle ?? true} />
            </div>

            {/* Últimos envios */}
            <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 16 }}>
                MÉTRICAS DE HOJE
              </div>
              {[
                { label: 'Lembretes enviados', value: data.sentToday     ?? '—' },
                { label: 'Confirmações recebidas', value: data.confirmedToday ?? '—' },
                { label: 'Alertas ao familiar',    value: data.familyAlerts  ?? '—' },
                { label: 'Taxa de entrega',        value: data.deliveryRate  ? `${data.deliveryRate}%` : '—' },
                { label: 'Taxa de confirmação',    value: data.confirmRate   ? `${data.confirmRate}%`  : '—' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#5A5248' }}>{item.label}</span>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: '#D4A853' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
