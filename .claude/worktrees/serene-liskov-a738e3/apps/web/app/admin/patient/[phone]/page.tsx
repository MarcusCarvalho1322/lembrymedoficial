'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

/* ── Gauge ───────────────────────────────────────────────────── */
function Gauge({ pct, size = 80 }: { pct: number; size?: number }) {
  const r  = 32;
  const c  = 2 * Math.PI * r;
  const p  = Math.min(Math.max(pct, 0), 100);
  const ds = c - (p / 100) * c;
  const color = p >= 75 ? '#5BB85B' : p >= 50 ? '#D4A853' : '#C0392B';

  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={6} />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={c} strokeDashoffset={ds} strokeLinecap="round"
        transform="rotate(-90 36 36)" style={{ transition: 'stroke-dashoffset .6s ease' }} />
      <text x="36" y="41" textAnchor="middle" fill={color}
        style={{ fontSize: 14, fontFamily: "'Cinzel',serif", fontWeight: 700 }}>
        {p}%
      </text>
    </svg>
  );
}

/* ── Adherence calendar ──────────────────────────────────────── */
function ConfirmationCell({ status }: { status: string }) {
  const bg = status === 'confirmed' ? 'rgba(91,184,91,.25)' : status === 'denied' ? 'rgba(192,57,43,.2)' : 'rgba(255,255,255,.04)';
  const bd = status === 'confirmed' ? 'rgba(91,184,91,.5)' : status === 'denied' ? 'rgba(192,57,43,.5)' : 'rgba(255,255,255,.08)';
  const icon = status === 'confirmed' ? '✓' : status === 'denied' ? '✗' : '·';
  const color = status === 'confirmed' ? '#5BB85B' : status === 'denied' ? '#C0392B' : '#5A5248';
  return (
    <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color, fontWeight: 700 }}>
      {icon}
    </div>
  );
}

/* ── Info card ───────────────────────────────────────────────── */
function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 12, padding: 20 }}>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 12 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── Edit modal ──────────────────────────────────────────────── */
function EditModal({ patient, token, onClose, onSaved }: { patient: any; token: string; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(patient.fullName || '');
  const [email, setEmail]       = useState(patient.email || '');
  const [isActive, setIsActive] = useState(patient.isActive ?? true);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  const save = async () => {
    setLoading(true); setErr('');
    try {
      await api(`/admin/patients/${patient.id}`, { method: 'PATCH', token, body: JSON.stringify({ fullName, email, isActive }) });
      onSaved();
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <style>{`
        .edit-input{background:#111;border:1px solid #1F1A15;color:#F0EDE8;border-radius:8px;padding:12px 14px;font-family:'Cormorant Garamond',serif;font-size:15px;width:100%;outline:none;transition:border .2s;}
        .edit-input:focus{border-color:#B87333;}
        .save-btn{background:linear-gradient(135deg,#B87333,#D4A853);color:#000;padding:12px 28px;border-radius:4px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;font-weight:700;border:none;cursor:pointer;transition:all .2s;}
        .save-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(184,115,51,.3);}
        .save-btn:disabled{opacity:.5;cursor:not-allowed;}
        .cancel-btn{background:transparent;border:1px solid rgba(184,115,51,.2);color:#998E82;padding:12px 28px;border-radius:4px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;cursor:pointer;transition:all .2s;}
        .cancel-btn:hover{border-color:rgba(184,115,51,.4);color:#B87333;}
      `}</style>
      <div style={{ background: '#0A0A0A', border: '1px solid rgba(184,115,51,.2)', borderRadius: 16, padding: 36, width: 440 }}>
        <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 20 }}>
          EDITAR PACIENTE
        </p>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 20 }}>
          <label style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 13, color: '#998E82' }}>Nome completo</label>
          <input className="edit-input" value={fullName} onChange={e => setFullName(e.target.value)} />
          <label style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 13, color: '#998E82' }}>E-mail</label>
          <input className="edit-input" value={email} onChange={e => setEmail(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#B87333' }} />
            <label htmlFor="isActive" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#998E82', cursor: 'pointer' }}>Conta ativa</label>
          </div>
        </div>

        {err && <div style={{ color: '#C0392B', fontSize: 13, marginBottom: 16, fontFamily: "'Cormorant Garamond',serif" }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="save-btn" onClick={save} disabled={loading}>{loading ? 'SALVANDO...' : 'SALVAR'}</button>
          <button className="cancel-btn" onClick={onClose}>CANCELAR</button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function PatientDetailPage() {
  const { phone }    = useParams();
  const { token }    = useAuth();
  const router       = useRouter();
  const [data, setData]     = useState<any>(null);
  const [error, setError]   = useState('');
  const [editing, setEditing] = useState(false);

  const load = () => {
    if (!token || !phone) return;
    api(`/admin/patients/${phone}`, { token }).then(setData).catch(e => setError(e.message));
  };

  useEffect(load, [token, phone]);

  if (error) return (
    <div style={{ padding: 40, fontFamily: "'Cormorant Garamond',serif", color: '#C0392B' }}>
      Erro: {error}
    </div>
  );

  if (!data) return (
    <div style={{ padding: 40 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: 12 }} />
      ))}
    </div>
  );

  const p   = data.patient;
  const sub = p.subscriptions?.[0];

  // Calcular adesão 7 dias
  const total     = data.history?.length || 0;
  const confirmed = data.history?.filter((h: any) => h.confirmation_status === 'confirmed').length || 0;
  const denied    = data.history?.filter((h: any) => h.confirmation_status === 'denied').length || 0;
  const noresp    = data.history?.filter((h: any) => h.confirmation_status === 'no_response').length || 0;
  const adherePct = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  // Agrupar history por data
  const byDate: Record<string, any[]> = {};
  (data.history || []).forEach((h: any) => {
    const d = h.date.split('T')[0];
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(h);
  });

  const statusColor = (s: string) =>
    s === 'confirmed' ? '#5BB85B' : s === 'denied' ? '#C0392B' : '#D4A853';
  const statusLabel = (s: string) =>
    s === 'confirmed' ? 'Confirmou' : s === 'denied' ? 'Não tomou' : 'Sem resposta';

  return (
    <>
      {editing && token && (
        <EditModal patient={p} token={token} onClose={() => setEditing(false)} onSaved={load} />
      )}

      <style>{`
        .edit-fab{background:linear-gradient(135deg,#B87333,#D4A853);color:#000;padding:10px 22px;border-radius:4px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;font-weight:700;border:none;cursor:pointer;transition:all .25s;}
        .edit-fab:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(184,115,51,.3);}
        .back-btn{background:transparent;border:1px solid rgba(184,115,51,.2);color:#998E82;padding:10px 18px;border-radius:4px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;cursor:pointer;transition:all .2s;}
        .back-btn:hover{border-color:#B87333;color:#B87333;}
        .hist-row{transition:background .15s;}
        .hist-row:hover td{background:rgba(184,115,51,.03)!important;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="back-btn" onClick={() => router.push('/admin/patients')}>← VOLTAR</button>
          <div>
            <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 4 }}>
              PERFIL DO PACIENTE
            </p>
            <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 26, fontWeight: 700, color: '#F0EDE8' }}>{p.fullName}</h1>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 14, marginTop: 2 }}>
              {p.phone} {p.email ? `· ${p.email}` : ''}
            </p>
          </div>
        </div>
        <button className="edit-fab" onClick={() => setEditing(true)}>EDITAR</button>
      </div>

      {/* Status + adesão em destaque */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 160px', gap: 14, marginBottom: 20 }}>
        <InfoCard label="Status da conta">
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: p.isActive ? '#5BB85B' : '#C0392B' }}>
            {p.isActive ? '● ATIVA' : '● INATIVA'}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 13, marginTop: 4 }}>
            {p.onboardingStep === 'active' ? 'Onboarding completo' : `Etapa: ${p.onboardingStep}`}
          </div>
        </InfoCard>

        <InfoCard label="Assinatura">
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, color: sub?.status === 'active' ? '#5BB85B' : '#C0392B' }}>
            {sub?.status === 'active' ? '● ATIVA' : sub?.status ? `● ${sub.status.toUpperCase()}` : '● SEM REGISTRO'}
          </div>
          {sub && (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 13, marginTop: 4 }}>
              Vence em {new Date(sub.expiresAt).toLocaleDateString('pt-BR')}
            </div>
          )}
        </InfoCard>

        <InfoCard label="Familiar">
          {p.familyContacts?.length > 0 ? (
            <>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 600, color: '#F0EDE8' }}>
                {p.familyContacts[0].name}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#5A5248', marginTop: 3 }}>
                {p.familyContacts[0].phone}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 14 }}>
              Não cadastrado
            </div>
          )}
        </InfoCard>

        <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Gauge pct={adherePct} />
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5A5248', textTransform: 'uppercase' as const }}>ADESÃO 7D</div>
        </div>
      </div>

      {/* Medicamentos */}
      <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const, marginBottom: 14 }}>
          MEDICAMENTOS ATIVOS — {p.medications?.length || 0}
        </div>
        {p.medications?.length === 0 && (
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 15 }}>Nenhum medicamento cadastrado.</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10 }}>
          {p.medications?.map((m: any) => (
            <div key={m.id} style={{
              background: '#111', border: '1px solid rgba(184,115,51,.15)', borderRadius: 10,
              padding: '10px 16px', display: 'flex', flexDirection: 'column' as const, gap: 2,
            }}>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#D4A853', letterSpacing: 1 }}>
                {m.name}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#998E82' }}>
                {m.dosage} · {Array.isArray(m.times) ? m.times.join(', ') : m.times}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Estatísticas 7 dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Confirmadas', value: confirmed, color: '#5BB85B' },
          { label: 'Não tomadas', value: denied,    color: '#C0392B' },
          { label: 'Sem resposta', value: noresp,   color: '#D4A853' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 12, padding: 18, textAlign: 'center' as const }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5A5248', textTransform: 'uppercase' as const, marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Histórico */}
      <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 4, color: '#5A5248', textTransform: 'uppercase' as const }}>
            HISTÓRICO DE CONFIRMAÇÕES — ÚLTIMOS 7 DIAS
          </div>
        </div>

        {data.history?.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' as const, fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 16 }}>
            Nenhum registro nos últimos 7 dias.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Data', 'Horário', 'Medicamento', 'Status', 'Familiar alertado'].map(h => (
                  <th key={h} style={{ textAlign: 'left' as const, padding: '12px 16px', fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: '#5A5248', textTransform: 'uppercase' as const, fontWeight: 400 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.history.map((h: any, i: number) => (
                <tr key={i} className="hist-row">
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: '#998E82' }}>
                    {new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </td>
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: 'monospace', fontSize: 13, color: '#F0EDE8' }}>
                    {h.medication_time?.slice(0, 5)}
                  </td>
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cormorant Garamond',serif", fontSize: 15, color: '#D4A853' }}>
                    {h.med_name} <span style={{ color: '#5A5248', fontSize: 13 }}>{h.dosage}</span>
                  </td>
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, color: statusColor(h.confirmation_status), letterSpacing: 1 }}>
                      {statusLabel(h.confirmation_status)}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: h.family_alerted ? '#D4A853' : '#5A5248' }}>
                    {h.family_alerted ? 'Sim — familiar avisado' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
