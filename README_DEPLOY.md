# Deploy do Lembrymed — Guia para Humanos

Guia passo a passo para colocar o Lembrymed no ar em uma VPS. Não requer conhecimento técnico profundo.

---

## Pré-requisitos

- [ ] Uma VPS contratada (recomendado: Hetzner CX22 ~R$25/mês)
- [ ] Domínio `lembrymed.com.br` configurado (DNS apontando para IP da VPS)
- [ ] Acesso ao painel da Z-API (WhatsApp)
- [ ] Acesso ao painel do Stripe (pagamentos)
- [ ] Acesso ao painel do DeepSeek (IA) — https://platform.deepseek.com
- [ ] Acesso ao GitHub (repositório do código)

> 💡 O banco de dados (PostgreSQL) roda como container Docker na própria VPS — não precisa de painel externo.

---

## Passo 1: Contratar e acessar a VPS

1. Contrate uma VPS na Hetzner (https://hetzner.com/cloud) — plano CX22
2. Escolha Ubuntu 22.04 como sistema operacional
3. Anote o IP da VPS (ex: `168.xxx.xxx.xxx`)
4. Anote a senha root (ou configure chave SSH)

No seu computador (Windows), abra o terminal e conecte:
```
ssh root@168.xxx.xxx.xxx
```

---

## Passo 2: Instalar Docker

Na VPS, execute:
```bash
curl -fsSL https://get.docker.com | sh
```

Verifique:
```bash
docker --version
# Deve mostrar: Docker version 26.x.x
```

---

## Passo 3: Configurar domínio

1. No painel do seu provedor de domínio (Registro.br, GoDaddy, etc.)
2. Crie um registro A: `lembrymed.com.br` → IP da VPS
3. Crie um registro A: `www.lembrymed.com.br` → IP da VPS
4. Aguarde 5-30 minutos para propagar

---

## Passo 4: Clonar o projeto

Na VPS:
```bash
cd /opt
git clone https://github.com/MarcusCarvalho1322/lembrymed.git lembrymed
cd lembrymed
```

---

## Passo 5: Configurar variáveis de ambiente

Crie o arquivo de configuração:
```bash
nano /opt/lembrymed/.env
```

Copie e cole o conteúdo abaixo, substituindo os valores pelos reais:

```bash
# Ambiente
NODE_ENV=production
PORT=3000

# Banco de dados (PostgreSQL — roda na própria VPS)
POSTGRES_USER=lembrymed
POSTGRES_PASSWORD=senha-forte-aqui      # INVENTE uma senha forte
POSTGRES_DB=lembrymed

# LLM (DeepSeek V3)
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...          # Copie de platform.deepseek.com
ANTHROPIC_API_KEY=sk-ant-...     # Mantenha como fallback opcional

# WhatsApp (Z-API)
WHATSAPP_PROVIDER=zapi
ZAPI_INSTANCE_ID=...             # Copie do painel Z-API
ZAPI_TOKEN=...                   # Copie do painel Z-API
ZAPI_CLIENT_TOKEN=...            # Copie do painel Z-API
ZAPI_WEBHOOK_TOKEN=...           # Gere com: openssl rand -hex 24

# Stripe
STRIPE_SECRET_KEY=sk_live_...    # Copie do painel Stripe
STRIPE_WEBHOOK_SECRET=whsec_...  # Copie do painel Stripe
STRIPE_PRICE_ANNUAL=price_...    # Copie do painel Stripe

# URLs
WEB_URL=https://lembrymed.com.br
API_URL=https://lembrymed.com.br

# Admin
ADMIN_EMAIL=marcus@bizzia.com.br
ADMIN_PASSWORD_HASH=...          # Gere com: node -e "require('bcryptjs').hash('senha',12).then(console.log)"
NEXTAUTH_SECRET=...              # Gere com: openssl rand -base64 32
ADMIN_WHATSAPP=5565xxxxxxxxx     # Seu WhatsApp (opcional, para alertas)

# Frontend (Next.js)
NEXT_PUBLIC_API_URL=https://lembrymed.com.br
NEXT_PUBLIC_WEB_URL=https://lembrymed.com.br

# Opcionais
LOG_LEVEL=info
```

Salve com `Ctrl+O`, saia com `Ctrl+X`.

Proteja o arquivo:
```bash
chmod 600 /opt/lembrymed/.env
```

---

## Passo 6: Subir a aplicação

```bash
cd /opt/lembrymed
docker compose -f docker-compose.prod.yml up -d --build
```

Isso vai baixar as imagens, compilar o código e iniciar tudo. Aguarde 2-3 minutos.

---

## Passo 7: Verificar se está no ar

```bash
# Verificar healthcheck
curl http://localhost:3000/health

# Deve responder algo como:
# {"status":"ok","checks":{"redis":"connected","database":"connected"}}
```

Acesse `https://lembrymed.com.br` no navegador. A landing page deve carregar.

---

## Passo 8: Configurar webhooks nos serviços externos

### Z-API
1. Acesse https://z-api.io → sua instância → Settings
2. Webhook URL: `https://lembrymed.com.br/webhook/whatsapp`
3. Webhook Security Token: mesmo valor de `ZAPI_WEBHOOK_TOKEN` do .env

### Stripe
1. Acesse https://dashboard.stripe.com → Developers → Webhooks
2. Endpoint URL: `https://lembrymed.com.br/webhook/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, etc.
4. Copie o `whsec_...` e atualize no `.env` se necessário

---

## Passo 9: Configurar backup automático

Na VPS:
```bash
# Tornar scripts executáveis
chmod +x /opt/lembrymed/scripts/*.sh

# Agendar backup diário (3:00 AM)
echo "0 3 * * * /opt/lembrymed/scripts/backup.sh" | crontab -

# Agendar healthcheck a cada 5 minutos
echo "*/5 * * * * /opt/lembrymed/scripts/healthcheck.sh" | crontab -
```

---

## Comandos úteis

```bash
# Ver logs da API
docker compose -f docker-compose.prod.yml logs -f api

# Ver logs do frontend
docker compose -f docker-compose.prod.yml logs -f web

# Reiniciar tudo
docker compose -f docker-compose.prod.yml restart

# Atualizar código (após git push)
cd /opt/lembrymed
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Ver status dos containers
docker compose -f docker-compose.prod.yml ps
```

---

## Se algo der errado

1. **Healthcheck falhou:** veja os logs com `docker compose logs api`
2. **Site não carrega:** verifique o DNS (pode levar até 1h)
3. **Webhook não chega:** verifique se o firewall da VPS libera portas 80 e 443
4. **DeepSeek não responde:** verifique `DEEPSEEK_API_KEY` no .env
5. **Emergência:** entre em contato com o desenvolvedor
