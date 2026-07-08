/**
 * @module Middleware — Security Headers (Helmet-lite)
 * @description Adiciona headers de segurança padrão OWASP em todas as respostas.
 *
 * Por que não `helmet`? Para evitar nova dependência. A mesma cobertura é
 * obtida com ~20 linhas aqui, sem supply-chain risk adicional.
 *
 * Cobertura:
 *   - HSTS (força HTTPS)
 *   - X-Content-Type-Options: nosniff (bloqueia MIME sniffing)
 *   - X-Frame-Options: DENY (bloqueia clickjacking)
 *   - Referrer-Policy: strict-origin-when-cross-origin (vaza menos)
 *   - Cross-Origin-Resource-Policy: same-origin (isola recursos)
 *   - X-XSS-Protection: 0 (valor moderno: desativar, CSP é a real defesa)
 *
 * CSP NÃO é setada aqui porque a API retorna JSON — CSP real fica no Next.js.
 */

import { Request, Response, NextFunction } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.removeHeader('X-Powered-By'); // esconde fingerprint Express
  next();
}
