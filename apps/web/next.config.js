/** @type {import('next').NextConfig} */
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://lembrymed-api-production.up.railway.app';

// Headers de segurança (paralelo ao apps/api/securityHeaders.ts).
// CSP é montada com a API_URL para permitir XHR cross-origin do admin.
const securityHeaders = [
  // HSTS — força HTTPS por 1 ano + preload
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  // Bloqueia MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Bloqueia clickjacking via iframe externo
  { key: 'X-Frame-Options', value: 'DENY' },
  // Vaza menos info na navegação cross-origin
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restringe APIs do navegador
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // XSS Protection moderno: desabilitar o filtro antigo, CSP é a defesa real
  { key: 'X-XSS-Protection', value: '0' },
  // CSP — permissivo em styles porque o admin usa inline styles JSX;
  // restritivo no resto. connect-src inclui a API Railway para o admin.
  {
    key: 'Content-Security-Policy',
    value: [
      `default-src 'self'`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
      `style-src 'self' 'unsafe-inline' fonts.googleapis.com`,
      `font-src 'self' fonts.gstatic.com data:`,
      `img-src 'self' data: blob: https:`,
      `connect-src 'self' ${API_URL} https://api.stripe.com https://*.vercel.app`,
      `frame-src https://js.stripe.com https://hooks.stripe.com`,
      `form-action 'self' https://checkout.stripe.com`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `object-src 'none'`,
    ].join('; '),
  },
];

const nextConfig = {
  output: 'standalone', // Docker: gera build autossuficiente sem node_modules
  reactStrictMode: true,
  poweredByHeader: false, // esconde 'X-Powered-By: Next.js'
  transpilePackages: ['@lembrymed/shared', '@lembrymed/database'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      // Atenção: rotas /api/* do Next (em apps/web/app/api/*) têm precedência
      // sobre rewrite. /api/checkout (route.ts local) NÃO é proxiado.
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
    ];
  },
};

module.exports = nextConfig;
