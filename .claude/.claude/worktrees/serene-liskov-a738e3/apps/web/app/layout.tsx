import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://lembrymed.com.br';

export const metadata: Metadata = {
  title: 'Lembrymed — Lembretes inteligentes de medicação via WhatsApp',
  description:
    'Nunca mais esqueça seus medicamentos. Lembretes automáticos via WhatsApp, 100% automatizado. Se esquecer, seu familiar é avisado.',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Lembrymed — Cuidar é uma decisão',
    description: 'Lembretes inteligentes de medicação via WhatsApp. Assine por R$ 149/ano.',
    type: 'website',
    locale: 'pt_BR',
    url: siteUrl,
    siteName: 'Lembrymed',
    images: [{ url: '/logo-new.png', width: 1200, height: 630, alt: 'Lembrymed — Lembretes via WhatsApp' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lembrymed — Cuidar é uma decisão',
    description: 'Lembretes inteligentes de medicação via WhatsApp. Assine por R$ 149/ano.',
    images: ['/logo-new.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1A5632',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
