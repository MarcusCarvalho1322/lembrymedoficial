'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminLogin } from '@/lib/api';
import { AuthContext } from '@/lib/auth-context';

const NAV = [
  { icon: '◈', label: 'Dashboard',  path: '/admin' },
  { icon: '◉', label: 'Pacientes',  path: '/admin/patients' },
  { icon: '◈', label: 'Receita',    path: '/admin/revenue' },
  { icon: '◉', label: 'Renovações', path: '/admin/renewals' },
  { icon: '◈', label: 'Fila',       path: '/admin/queue' },
];

/* ─── Login ────────────────────────────────────────────────── */
function LoginScreen({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true); setError('');
    try {
      const token = await adminLogin(email, password);
      localStorage.setItem('lembrymed_token', token);
      onLogin(token);
    } catch {
      setError('Credenciais inválidas. Verifique e tente novamente.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#000',
      backgroundImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(184,115,51,.06) 0%, transparent 70%)',
    }}>
      <style>{`
        .login-input{background:#111;border:1px solid #1F1A15;color:#F0EDE8;border-radius:8px;padding:14px 16px;font-family:'Cormorant Garamond',serif;font-size:16px;width:100%;outline:none;transition:border .2s;}
        .login-input:focus{border-color:#B87333;}
        .login-input::placeholder{color:#5A5248;}
        .login-btn{background:linear-gradient(135deg,#B87333,#D4A853);color:#000;padding:15px 36px;border-radius:4px;font-family:'Cinzel',serif;font-size:11px;letter-spacing:4px;font-weight:700;border:none;cursor:pointer;transition:all .25s;width:100%;}
        .login-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(184,115,51,.35);}
        .login-btn:disabled{opacity:.5;cursor:not-allowed;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      `}</style>

      <div style={{ width: 380, animation: 'fadeIn .5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 22, letterSpacing: 8, color: '#B87333', marginBottom: 6 }}>
            LEMBRYMED
          </div>
          <div style={{ width: 40, height: 1, background: 'linear-gradient(90deg,transparent,#B87333,transparent)', margin: '0 auto 12px' }} />
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#5A5248', fontSize: 14 }}>
            Painel Administrativo
          </div>
        </div>

        <div style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,.04)', borderRadius: 16, padding: 36 }}>
          <p style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 6, color: '#B87333', textTransform: 'uppercase' as const, marginBottom: 24 }}>
            ACESSO RESTRITO
          </p>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <input className="login-input" type="email" placeholder="E-mail"
              value={email} onChange={e => setEmail(e.target.value)} />
            <input className="login-input" type="password" placeholder="Senha"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(192,57,43,.1)', border: '1px solid rgba(192,57,43,.3)', borderRadius: 6, color: '#C0392B', fontSize: 14, fontFamily: "'Cormorant Garamond',serif" }}>
              {error}
            </div>
          )}

          <button className="login-btn" onClick={submit} disabled={loading} style={{ marginTop: 24 }}>
            {loading ? 'VERIFICANDO...' : 'ENTRAR'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', color: '#2A2420', fontSize: 13 }}>
          Lembrymed © {new Date().getFullYear()} · Todos os direitos reservados
        </div>
      </div>
    </div>
  );
}

/* ─── Layout Principal ─────────────────────────────────────── */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('lembrymed_token');
    if (saved) setToken(saved);
    setReady(true);
  }, []);

  const logout = () => { localStorage.removeItem('lembrymed_token'); setToken(null); };

  if (!ready) return null;
  if (!token)  return <LoginScreen onLogin={setToken} />;

  return (
    <AuthContext.Provider value={{ token, logout }}>
      <style>{`
        .nav-item{display:flex;align-items:center;gap:12px;padding:11px 20px;cursor:pointer;color:rgba(240,237,232,.35);border-left:2px solid transparent;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;transition:all .2s;user-select:none;}
        .nav-item:hover{color:rgba(240,237,232,.7);background:rgba(184,115,51,.06);}
        .nav-item.active{color:#F0EDE8;background:rgba(184,115,51,.08);border-left-color:#B87333;}
        .nav-icon{font-size:14px;color:#B87333;opacity:.7;}
        .nav-item.active .nav-icon{opacity:1;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .logout-btn{width:100%;padding:9px 12px;background:transparent;border:1px solid rgba(184,115,51,.15);border-radius:6px;color:#5A5248;font-size:9px;cursor:pointer;font-family:'Cinzel',serif;letter-spacing:3px;text-transform:uppercase;transition:all .2s;}
        .logout-btn:hover{border-color:rgba(184,115,51,.4);color:#B87333;}
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#000' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: 220, background: '#0A0A0A', borderRight: '1px solid rgba(255,255,255,.04)',
          display: 'flex', flexDirection: 'column' as const, flexShrink: 0,
          position: 'sticky' as const, top: 0, height: '100vh',
        }}>
          {/* Logo */}
          <div style={{ padding: '28px 20px 24px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, letterSpacing: 5, color: '#B87333' }}>
              LEMBRYMED
            </div>
            <div style={{ width: 30, height: 1, background: 'linear-gradient(90deg,#B87333,transparent)', marginTop: 8 }} />
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 11, color: '#5A5248', marginTop: 4 }}>
              Admin Console
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, paddingTop: 12 }}>
            {NAV.map(n => (
              <div key={n.path} className={`nav-item ${pathname === n.path ? 'active' : ''}`}
                onClick={() => router.push(n.path)}>
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,.04)' }}>
            <button className="logout-btn" onClick={logout}>SAIR</button>
          </div>
        </div>

        {/* ── Main ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 40px', animation: 'fadeIn .3s ease' }}>
          {children}
        </div>
      </div>
    </AuthContext.Provider>
  );
}
