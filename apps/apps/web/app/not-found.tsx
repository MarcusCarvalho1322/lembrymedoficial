import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{
      minHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '24px',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      color: '#1A1A1A',
    }}>
      <h1 style={{ fontSize: '64px', fontWeight: 900, color: '#1A5632', marginBottom: '8px' }}>404</h1>
      <p style={{ fontSize: '20px', fontWeight: 600, color: '#374151', marginBottom: '24px' }}>
        Página não encontrada
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          background: '#1A5632',
          color: '#fff',
          padding: '14px 32px',
          borderRadius: '10px',
          fontSize: '16px',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Voltar ao início →
      </Link>
    </main>
  );
}
