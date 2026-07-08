'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

const STEP_LABEL: Record<string, string> = {
  active:                 'Ativo',
  welcome_sent:           'Boas-vindas',
  medications_requested:  'Aguardando meds',
  medications_received:   'Meds recebidos',
  medications_confirmed:  'Meds confirmados',
  family_asked:           'Aguardando familiar',
};

function StatusBadge({ step }: { step: string }) {
  const active = step === 'active';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 10,
      background: active ? 'rgba(91,184,91,.1)' : 'rgba(212,168,83,.1)',
      color: active ? '#5BB85B' : '#D4A853',
      border: `1px solid ${active ? 'rgba(91,184,91,.2)' : 'rgba(212,168,83,.2)'}`,
      fontFamily: "'Cinzel',serif", letterSpacing: 1,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#5BB85B' : '#D4A853', display: 'inline-block' }} />
      {STEP_LABEL[step] || step}
    </span>
  );
}

function AdherenceBar({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  const color = pct >= 75 ? '#5BB85B' : pct >= 50 ? '#D4A853' : '#C0392B';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .4s' }} />
      </div>
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

export default function PatientsPage() {
  const { token } = useAuth();
  const router    = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch]     = useState('');
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (q: string, p: number) => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ search: q, limit: '25', page: String(p) });
    api(`/admin/patients?${params}`, { token })
      .then(d => { setPatients(d.patients); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); load(search, 1); }, 300);
  }, [search, token]);

  useEffect(() => { load(search, page); }, [page]);

  const totalPages = Math.ceil(total / 25);

  return (
    <>
      <style>{`
        .pt-row{cursor:pointer;transition:background .15s;}
        .pt-row:hover td{background:rgba(184,115,51,.04)!important;}
        .search-input{background:#111;border:1px solid #1F1A15;color:#F0EDE8;border-radius:8px;padding:10px 16px 10px 40px;font-family:'Cormorant Garamond',serif;font-size:15px;width:260px;outline:none;transition:border .2s;}
        .search-input:focus{border-color:#B87333;}
        .search-input::placeholder{color:#5A5248;}
        .pg-btn{background:transparent;border:1px solid rgba(184,115,51,.2);color:#998E82;padding:7px 14px;border-radius:6px;font-family:'Cinzel',serif;font-size:9px;letter-spacing:2px;cursor:pointer;transition:all .2s;}
        .pg-btn:hover:not(:disabled){border-color:#B87333;color:#B87333;}
        .pg-btn:disabled{opacity:.3;cursor:not-allowed;}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 8 }}>
          GESTÃO
        </p>
        <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: '#F0EDE8' }}>
          Pacientes
        </h1>
        <div style={{ width: 40, height: 2, background: '#B87333', marginTop: 10, marginBottom: 6 }} />
        <p style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 15 }}>
          {total} pacientes cadastrados
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ position: 'relative' as const }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#5A5248', fontSize: 14 }}>⌕</span>
          <input className="search-input" placeholder="Buscar por nome ou telefone..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' as const }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8, borderRadius: 6 }} />
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                {['Paciente', 'Telefone', 'Meds', 'Status', 'Adesão hoje', 'Perdidas', 'Última atividade'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left' as const, padding: '14px 16px',
                    fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3,
                    color: '#5A5248', textTransform: 'uppercase' as const, fontWeight: 400,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: 'center' as const, fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 16 }}>
                    Nenhum paciente encontrado.
                  </td>
                </tr>
              )}
              {patients.map((p: any, idx: number) => (
                <tr key={p.id} className="pt-row"
                  onClick={() => router.push(`/admin/patient/${p.phone}`)}>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 600, color: '#F0EDE8' }}>{p.full_name}</div>
                    {p.email && <div style={{ fontSize: 12, color: '#5A5248', marginTop: 2 }}>{p.email}</div>}
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: 'monospace', fontSize: 12, color: '#998E82' }}>
                    {p.phone}
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 16, fontWeight: 700, color: '#F0EDE8' }}>{p.med_count}</span>
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <StatusBadge step={p.onboarding_step} />
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <AdherenceBar confirmed={Number(p.confirmed_today) || 0} total={Number(p.med_count) || 0} />
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    {Number(p.missed_today) > 0 ? (
                      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: '#C0392B', fontWeight: 700 }}>
                        {p.missed_today}
                      </span>
                    ) : (
                      <span style={{ color: '#5A5248', fontSize: 13 }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.03)', fontFamily: "'Cormorant Garamond',serif", fontSize: 13, color: '#5A5248' }}>
                    {p.last_activity ? new Date(p.last_activity).toLocaleString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
          <button className="pg-btn" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>← ANTERIOR</button>
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#998E82', letterSpacing: 2 }}>
            {page} / {totalPages}
          </span>
          <button className="pg-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>PRÓXIMA →</button>
        </div>
      )}
    </>
  );
}
