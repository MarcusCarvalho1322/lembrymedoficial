# LEMBRYMED — ROTEIRO COMPLETO DE CONVERSAS NO WHATSAPP
### Do pagamento ao lembrete diário · Templates reais do sistema

> Este documento mostra EXATAMENTE como as conversas acontecem, mensagem por mensagem.
> Baseado no código atual do repositório (prompts, templates e workers).

---

## ÍNDICE

1. Boas-vindas (após pagamento)
2. Onboarding — Etapa 1: Medicamentos
3. Onboarding — Etapa 2: Familiar (opcional)
4. Ativação
5. Lembretes diários (T=0 / T+10)
6. Confirmação SIM/NÃO
7. Alerta ao familiar
8. Fluxos especiais (renovação, LGPD, relatório mensal, nudges)

---

## 1. BOAS-VINDAS (logo após o pagamento confirmado)

*Disparada automaticamente pelo webhook do Stripe, segundos após o pagamento.*

> 👋 **Lembrymed**:
> Olá, Maria! 👋
>
> Seu pagamento foi confirmado e o *Lembrymed* está ativado! ✅
>
> Vou te ajudar a configurar seus lembretes de medicamentos em poucos minutos.
>
> Para começar, me diga: *quais medicamentos você toma atualmente?*
>
> Pode me enviar a lista ou uma foto da receita 📋

---

## 2. ONBOARDING — ETAPA 1: MEDICAMENTOS

*A IA (DeepSeek V3) conduz a conversa em português natural, com respostas curtas e emojis moderados.*

### 2.1 Paciente manda a lista completa

> 🧓 **Maria**: Tomo losartana 50mg de manhã, metformina 500mg no almoço e no jantar, e sinvastatina 20mg à noite.

> **Lembrymed**:
> Perfeito, Maria! Vou organizar seus lembretes assim:
>
> 💊 Losartana 50mg — 08:00
> 💊 Metformina 500mg — 12:00 e 20:00
> 💊 Sinvastatina 20mg — 21:00
>
> Está tudo certo? 😊
> *(a IA só confirma depois que TODOS os horários existem)*

> 🧓 **Maria**: Sim, certinho!

### 2.2 Paciente lista sem horários

> 🧓 **Maria**: Tomo losartana e metformina.

> **Lembrymed**:
> Ótimo! Em quais horários você costuma tomar cada um? 🕐

### 2.3 Paciente manda foto da receita

*Na versão atual, o sistema lê a imagem. Na V2.2 (proposta dos sócios), imagens serão recusadas com orientação para texto/áudio.*

> 🧓 **Maria**: *[envia foto da receita]*

> **Lembrymed**:
> Vi na sua receita: Losartana 50mg e Metformina 500mg. Em quais horários você costuma tomar cada um? 🕐

---

## 3. ONBOARDING — ETAPA 2: FAMILIAR (opcional)

*Depois dos medicamentos confirmados, na MESMA conversa.*

> **Lembrymed**:
> Perfeito, Maria! Seus medicamentos estão cadastrados. ✅
>
> Deseja cadastrar um contato familiar que receberá um aviso caso você esqueça de confirmar que tomou seu medicamento? É opcional — basta me enviar o nome e o número de WhatsApp. 👨‍👩‍👧

### 3.1 Paciente quer cadastrar familiar

> 🧓 **Maria**: Sim! Minha filha Ana, 11 98888-7777

> **Lembrymed**:
> Combinado! Sua filha Ana vai receber um aviso caso você não confirme uma medicação. Tudo pronto! 💙

### 3.2 Paciente não quer familiar

> 🧓 **Maria**: Agora não, obrigada.

> **Lembrymed**:
> Sem problema! Você pode adicionar um familiar quando quiser. Está tudo pronto! 😊

### 3.3 Paciente tenta cadastrar o PRÓPRIO número (bloqueio de segurança)

> 🧓 **Maria**: Pode colocar meu próprio número mesmo.

> **Lembrymed**:
> Pelas nossas diretrizes de uso, não é permitido usar o seu próprio número como contato familiar — a notificação precisa chegar a outra pessoa. 😊 Você pode deixar esse campo em aberto e adicionar um familiar quando decidir!

---

## 4. ATIVAÇÃO

*Mensagem final do onboarding. A partir daqui os lembretes começam no próximo horário de dose.*

> **Lembrymed**:
> Tudo pronto, Maria! 🎉
>
> A partir de agora eu te lembro dos seus medicamentos todos os dias no WhatsApp.
>
> Quando eu perguntar, é só responder **SIM** ou **NÃO** — ou mandar um áudio! 💊

---

## 5. LEMBRETES DIÁRIOS (RÉGUA DE DISPARO)

*Sistema de 2 mensagens por dose. Horários sempre no fuso de Brasília.*

### 5.1 T=0 (na hora exata)

> **Lembrymed**:
> 💊 São 08:00 — hora de tomar sua Losartana!

### 5.2 T+10 (10 minutos depois — pedido de confirmação)

> **Lembrymed**:
> Você tomou sua Losartana?
> Responda SIM ou NÃO 💊

---

## 6. CONFIRMAÇÃO SIM/NÃO

*Processamento sem IA — o sistema reconhece palavras-chave. Máximo 1 resposta por dose.*

### Vocabulário reconhecido

| Resposta | Palavras aceitas |
|----------|------------------|
| ✅ SIM | "SIM", "S", "SI", "YES", "1", "TOMEI", "TOMEI SIM", "JÁ TOMEI", "JA TOMEI" |
| ❌ NÃO | "NÃO", "NAO", "N", "NO", "0", "NÃO TOMEI", "NAO TOMEI", "AINDA NÃO", "AINDA NAO" |

### 6.1 Paciente confirma

> 🧓 **Maria**: SIM

> **Lembrymed**:
> Ótimo, registrado às 08:05! Continue assim! 💙
>
> *Se a paciente tomar vários remédios no mesmo horário, um SIM vale para todos daquele horário.*

### 6.2 Paciente nega

> 🧓 **Maria**: NÃO

> **Lembrymed**: *(sem resposta imediata — o sistema registra a recusa)*

*Se não houver confirmação em 30 minutos, dispara o alerta familiar (seção 7).*

---

## 7. ALERTA AO FAMILIAR

*30 minutos após o T+10 sem confirmação. Máximo 1 alerta por dia por familiar (anti-spam).*

> 👨‍👩‍👧 **Lembrymed** → WhatsApp da **Ana** (filha):
> ⚠️ Atenção, Ana! Maria não confirmou que tomou Losartana às 08:00. Por favor, verifique se está tudo bem.

---

## 8. FLUXOS ESPECIAIS

### 8.1 Atualização de medicamentos (paciente ativo)

*Disparado por palavras como "mudei", "parei", "alterar", "novo remédio"...*

> 🧓 **Maria**: O médico mudou minha receita, quero atualizar os remédios.

> **Lembrymed**:
> Para atualizar seus medicamentos, precisarei recadastrar a lista completa, Maria! 📋
>
> Seus medicamentos atuais são:
> • Losartana 50mg → 08:00
> • Metformina 500mg → 12:00, 20:00
>
> Me diga: o que permanece igual + o que mudou + o que é novo.

### 8.2 Pedido LGPD pelo WhatsApp (paciente ativo)

| Comando do paciente | Ação do sistema |
|---------------------|-----------------|
| "EXCLUIR MEUS DADOS" ou "APAGAR MEUS DADOS" | Registra pedido, avisa admin, exclusão manual em até 15 dias |
| "EXPORTAR MEUS DADOS" ou "BAIXAR MEUS DADOS" | Registra pedido, admin exporta os dados |

> 🧓 **Maria**: EXCLUIR MEUS DADOS

> **Lembrymed**:
> Entendi! Recebemos seu pedido de exclusão de dados. 📝
>
> Por segurança, você tem 24 horas para cancelar — basta enviar CANCELAR.
>
> Caso contrário, seus dados serão excluídos permanentemente dentro de até 15 dias, conforme a LGPD.

### 8.3 Renovação de assinatura (vencimento em 30/15/3 dias)

> **Lembrymed**:
> Olá, Maria! 😊 Sua assinatura do Lembrymed vence em 15 dias. Para não interromper seus lembretes, acesse o link de renovação que te enviei. 💊

*Após o pagamento da renovação:*

> **Lembrymed**:
> Maria, que ótimo! 🎉 Sua assinatura do *Lembrymed* foi renovada com sucesso!
>
> Seus lembretes de medicamentos voltam a funcionar agora. ✅
>
> Validade: *17 de setembro de 2027*
>
> Sentimos sua falta! 💊 Qualquer dúvida, é só me chamar.

### 8.4 Relatório mensal de adesão (dia 1º de cada mês)

> **Lembrymed**:
> 📊 Resumo de adesão de Maria — Julho/2026:
>
> 💊 Losartana: 28 de 31 doses confirmadas (90%)
> 💊 Metformina: 55 de 62 doses confirmadas (89%)
> 💊 Sinvastatina: 30 de 31 doses confirmadas (97%)
>
> Excelente trabalho! Continue assim! 💙

### 8.5 Nudge de onboarding (paciente parou no meio)

*Se o paciente ficar parado 2+ horas em uma etapa (máx. 2 nudges por etapa).*

> **Lembrymed**:
> Oi, Maria! 😊 Percebi que paramos no meio do seu cadastro. Quer continuar? É rapidinho — me diga seus medicamentos e horários e eu cuido do resto! 💊

### 8.6 Z-API offline (alerta interno — vai para o ADMIN, não o paciente)

> 📱 **Lembrymed** → WhatsApp do **Marcus**:
> 🚨 Lembrymed — Z-API desconectada. Os lembretes estão pausados. Verifique o painel z-api.io.

---

## 9. JORNADA COMPLETA EM LINHA DO TEMPO

```
DIA 0   ─ 12:34  Maria paga R$ 149 no site (PIX/cartão/boleto)
        ─ 12:34  WhatsApp: "Olá, Maria! Seu pagamento foi confirmado..."
        ─ 12:35  Maria: "Tomo losartana 50mg de manhã..."
        ─ 12:36  Bot: "Perfeito! Vou organizar assim..." ✓
        ─ 12:37  Bot: "Deseja cadastrar um familiar?"
        ─ 12:38  Maria: "Sim! Minha filha Ana, 11 98888-7777"
        ─ 12:38  Bot: "Tudo pronto! 🎉"  →  PACIENTE ATIVO

DIA 1   ─ 08:00  Lembrete T=0: "💊 São 08:00 — hora de tomar sua Losartana!"
        ─ 08:10  Lembrete T+10: "Você tomou sua Losartana? Responda SIM ou NÃO"
        ─ 08:12  Maria: "SIM"
        ─ 08:12  Bot: "Ótimo, registrado às 08:12! Continue assim! 💙"
        → (repetir para cada dose do dia)

DIA 3   ─ 08:10  Lembrete T+10: "Você tomou sua Losartana?..."
        ─ 08:11  (Maria não responde)
        ─ 08:40  ⚠️ Alerta para Ana: "Maria não confirmou que tomou
                 Losartana às 08:00. Por favor, verifique se está tudo bem."
        ─ 08:45  Ana liga para Maria. Tudo resolvido. ✅

DIA 15  ─ (fim do período de teste grátis)
        ─ 09:00  Rotina diária: renovações, check-ins, retenção LGPD

DIA 1º  ─ 09:00  Relatório mensal enviado para Maria e Ana
```

---

## 10. NOTAS DE COMPORTAMENTO (REGRAS DO SISTEMA)

| Regra | Detalhe |
|-------|---------|
| Paciente ativo só fala de remédio | Perguntas médicas ("posso tomar com café?") são ignoradas silenciosamente (V2.2 propõe resposta orientada: "consulte seu médico") |
| Um SIM vale para todos do horário | Se toma 3 remédios às 08:00, um "SIM" confirma os 3 |
| Resposta fora da janela | "TOMEI" fora do horário T+10 não conta como confirmação do dia |
| Alerta familiar | Máximo 1 por dia, independente de quantos remédios não confirmados |
| Horário | Tudo em horário de Brasília (America/Sao_Paulo) |
| Privacidade | Conversas são anonimizadas após 90 dias (LGPD) |
| Tom do bot | Português brasileiro, caloroso, frases curtas, emojis com moderação (💊 🕐 ✅ 👨‍👩‍👧) |

---

*Documento gerado a partir do código real (prompts de onboarding, templates de lembrete e fluxos de worker). Válido para a versão atual do repositório. Régua de 2 mensagens (T=0 e T+10) já implementada por decisão de produto. A spec V2.2 (sócios) prevê ainda: áudio via Whisper, planos Prata/Ouro — ver `ANALISE_SPEC_V22_SOCIOS.md`.*
