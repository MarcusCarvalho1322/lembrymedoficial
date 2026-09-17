# PLANO DE LANÇAMENTO — LEMBRYMED

> Documento de apresentação para sócios e investidores.
> **Data:** Julho 2026 | **Autor:** BIZZ.IA Intelligence Ecosystem

---

## 1. A DOR (O Problema Real)

### O que acontece quando ninguém supervisiona?

| Realidade | Dado |
|-----------|------|
| Pacientes crônicos que abandonam o tratamento | **50%** (OMS) |
| Idosos que tomam remédio errado ou esquecem | **7 em cada 10** |
| Filhos que só descobrem o abandono na emergência | **80% dos casos** |
| Custo da não-adesão nos EUA | **US$ 100 bilhões/ano** |
| Casos de diabetes no Brasil até 2050 | **24 milhões** |

**A dor não é só do paciente. É de quem ama ele e não pode estar lá 24h por dia.**

---

## 2. O CUIDADO (Como o Lembrymed resolve)

```
ANTES (sem Lembrymed):
  08:00 — Mãe deveria tomar losartana
  08:30 — Mãe esqueceu
  12:00 — Mãe toma dose dupla "para compensar"
  20:00 — Filho liga: "Tomou o remédio, mãe?" — "Acho que sim..."
  Resultado: ninguém sabe, ninguém confirma, risco silencioso.

DEPOIS (com Lembrymed):
  08:00 — WhatsApp: "Dona Maria, hora da sua Losartana 50mg 💊"
  08:05 — Dona Maria responde: "SIM"
  08:05 — App registra: ✅ Confirmado
  Se NÃO respondesse em 30min:
  08:35 — WhatsApp do filho: "⚠️ Sua mãe não confirmou a Losartana das 08:00"
  Filho liga, resolve, pronto. Paz de espírito.
```

---

## 3. O PRODUTO (Como funciona)

```
 ① Pagamento        ② Onboarding          ③ Lembretes            ④ Alerta Familiar
 ┌──────────┐       ┌──────────┐          ┌──────────┐           ┌──────────┐
 │ R$ 149/  │  →    │ WhatsApp │    →     │ 3 alertas │    →     │ Familiar │
 │ ano      │       │ conversa │          │ por dose  │          │ avisado  │
 └──────────┘       │ com IA   │          │ (T-10,    │          │ se não   │
                    └──────────┘          │ T=0, T+10)│          │ confirmar│
                                          └──────────┘           └──────────┘
```

**100% WhatsApp.** O paciente não baixa app, não cria conta, não decora senha. Só responde "SIM" ou "NÃO".

---

## 4. PERÍODO GRATUITO DE 15 DIAS

### Regra proposta para lançamento

| Parâmetro | Valor |
|-----------|-------|
| Dias gratuitos | **15 dias** |
| O que está incluso | Onboarding completo + lembretes + alerta familiar |
| O que NÃO está incluso | Relatório mensal de adesão (premium) |
| Cartão de crédito? | Sim, solicitado no cadastro (cobrado só após 15 dias) |
| Cancelamento | A qualquer momento nos 15 dias, sem custo |

### Custo operacional por assinante nos 15 dias gratuitos

| Recurso | Consumo estimado | Custo |
|---------|-----------------|-------|
| DeepSeek V3 (onboarding conversacional) | ~2.000 tokens input + 800 output | **R$ 0,03** |
| DeepSeek V3 (lembretes diários — templates fixos) | Zero (templates, sem IA) | **R$ 0,00** |
| Z-API WhatsApp (~40 mensagens em 15 dias) | 40 × R$ 0,05 | **R$ 2,00** |
| Neon PostgreSQL (armazenamento) | ~5KB por paciente | **R$ 0,01** |
| Infraestrutura (VPS rateada) | Fração mínima | **R$ 0,05** |
| **CUSTO TOTAL POR ASSINANTE NOS 15 DIAS** | | **≈ R$ 2,09** |

> 💡 **Conclusão:** Cada lead gratuito custa ~R$ 2,09. Com conversão de 30% para pagantes (R$ 149/ano), o CAC é de ~R$ 7,00 — **extremamente saudável**.

---

## 5. PLANO DE NEGÓCIO (Projeção)

### Ano 1 — Lançamento

| Mês | Assinantes | Receita Mensal | Custo Operacional | Lucro |
|-----|-----------|---------------|-------------------|-------|
| 1 | 10 | R$ 124 | R$ 60 | R$ 64 |
| 3 | 50 | R$ 620 | R$ 150 | R$ 470 |
| 6 | 200 | R$ 2.480 | R$ 300 | R$ 2.180 |
| 12 | 1.000 | R$ 12.400 | R$ 600 | R$ 11.800 |

**Custo fixo mensal:** VPS R$ 120 + Z-API R$ 50 + Neon R$ 90 + DeepSeek ~R$ 30 = **~R$ 290/mês** (suporta até ~5000 pacientes).

---

## 6. POR QUE AGORA?

| Fator | Evidência |
|-------|-----------|
| **WhatsApp no Brasil** | 98% de penetração. Nenhum concorrente usa como canal primário. |
| **Envelhecimento** | 24 milhões de diabéticos até 2050. Filhos cuidando de pais à distância. |
| **Mercado global** | US$ 1 bilhão em 2026 → US$ 3,5 bilhões em 2033 (CAGR 13%). |
| **Tecnologia pronta** | DeepSeek V3 (IA 70% mais barata), Docker (infra enxuta), Z-API (ativação em 5 min). |
| **LGPD compliant** | Consentimento explícito, auditoria, direito ao titular. Vantagem competitiva. |

---

## 7. PRÓXIMOS PASSOS

| Etapa | Prazo | Responsável |
|-------|-------|------------|
| 1. Finalizar checkout com trial de 15 dias | 1 semana | Dev |
| 2. Criar landing page de apresentação | 1 semana | Design |
| 3. Gravar demo (onboarding real no WhatsApp) | 3 dias | Marcus |
| 4. Abrir para 10 beta testers (familiares reais) | 2 semanas | Marcus |
| 5. Lançar publicamente | 4 semanas | Todos |

---

## 8. PITCH DE 30 SEGUNDOS

> "Sua mãe toma 4 remédios por dia. Você trabalha, mora em outra cidade, e só descobre que ela esqueceu quando algo grave acontece. O Lembrymed resolve isso: por R$ 149 por ano, a gente lembra ela no WhatsApp, e avisa você na hora se ela não confirmar. 15 dias grátis. Sem app. Sem complicação."
