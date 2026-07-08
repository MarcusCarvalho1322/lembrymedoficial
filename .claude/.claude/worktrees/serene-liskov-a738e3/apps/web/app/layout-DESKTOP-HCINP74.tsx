import type { Metadata, Viewport } from 'next';
import { DM_Sans, Playfair_Display, Cinzel, Cormorant_Garamond } from 'next/font/google';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://lembrymed.com.br';

// Fontes auto-hospedadas via next/font (melhor Core Web Vitals: sem CSS @import
// bloqueante, evita CLS de swap de fonte, preload automático).
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-playfair',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  variable: '--font-cinzel',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

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
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${playfair.variable} ${cinzel.variable} ${cormorant.variable}`}
    >
      <body className={dmSans.className}>{children}</body>
    </html>
  );
}
