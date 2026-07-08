'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminLogin } from '@/lib/api';

const AuthContext = createContext<{ token: string | null; logout: () => void }>({ token: null, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

const NAV = [
  { icon: '📊', label: 'Dashboard', path: '/admin' },
  { icon: '👥', label: 'Pacientes', path: '/admin/patients' },
  { icon: '💰', label: 'Receita', path: '/admin/revenue' },
  { icon: '🔄', label: 'Renovações', path: '/admin/renewals' },
  { icon: '⚙️', label: 'Fila', path: '/admin/queue' },
];

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const token = await adminLogin(email, password);
      localStorage.setItem('lembrymed_token', token);
      onLogin(token);
    } catch { setError('Credenciais inválidas'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7F6' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 380, width: '100%', border: '1px solid #E0E7E3' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.png" alt="Lembrymed" style={{ height: 36, marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: '#6B7280' }}>Painel Administrativo</div>
        </div>
        <input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: 12, border: '1px solid #E0E7E3', borderRadius: 8, marginBottom: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        <input placeholder="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width: '100%', padding: 12, border: '1px solid #E0E7E3', borderRadius: 8, marginBottom: 16, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={submit} disabled={loading}
          style={{ width: '100%', background: '#1A5632', color: '#fff', padding: 12, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('lembrymed_token');
    if (saved) setToken(saved);
    setReady(true);
  }, []);

  const logout = () => { localStorage.removeItem('lembrymed_token'); setToken(null); };

  if (!ready) return null;
  if (!token) return <LoginScreen onLogin={setToken} />;

  return (
    <AuthContext.Provider value={{ token, logout }}>
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
        {/* Sidebar */}
        <div style={{ width: 240, background: '#0F1F17', color: '#fff', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="Lembrymed" style={{ height: 28, filter: 'brightness(0) invert(1)' }} />
          </div>
          <div style={{ flex: 1, paddingTop: 8 }}>
            {NAV.map(n => (
              <div key={n.path} onClick={() => router.push(n.path)}
                style={{
                  padding: '11px 20px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  color: pathname === n.path ? '#fff' : 'rgba(255,255,255,0.5)',
                  background: pathname === n.path ? '#1A3326' : 'transparent',
                  borderLeft: pathname === n.path ? '3px solid #22C55E' : '3px solid transparent',
                }}>
                <span style={{ width: 18, textAlign: 'center' }}>{n.icon}</span> {n.label}
              </div>
            ))}
          </div>
          <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={logout} style={{ width: '100%', padding: 8, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sair
            </button>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', background: '#F5F7F6' }}>
          {children}
        </div>
      </div>
    </AuthContext.Provider>
  );
}
