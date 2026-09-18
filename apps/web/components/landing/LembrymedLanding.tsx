'use client';

import { useState, useEffect, useRef } from "react";

const S = `
* { margin:0; padding:0; box-sizing:border-box; }
:root {
  --green: #1A5632; --green-light: #E8F0EB; --green-mid: #2D7A4A; --green-dark: #0F3D23;
  --bg: #FEFEFE; --text: #1A1A1A; --sub: #374151;
  --hint: #4B5563;
  --card: #F8FAF9; --border: #1A5632;
  --font: var(--font-dm-sans), 'DM Sans', sans-serif;
  --serif: var(--font-playfair), 'Playfair Display', serif;
}
body { font-family: var(--font); color: var(--text); background: var(--bg); }
.container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

/* ── NAV ── */
.nav {
  padding: 14px 0;
  background: var(--green);
  position: sticky; top: 0; z-index: 50;
  box-shadow: 0 2px 16px rgba(0,0,0,0.18);
}
.nav-inner { display: flex; justify-content: center; align-items: center; position: relative; }
.nav-logo { height: 22px; }
.nav-cta {
  position: absolute; right: 0;
  background: #fff; color: var(--green);
  padding: 10px 26px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 700; cursor: pointer; font-family: var(--font);
  transition: all .2s;
}
.nav-cta:hover { background: var(--green-light); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

/* ── HERO ── */
.impact {
  background: linear-gradient(135deg, var(--green-dark) 0%, var(--green) 60%, #22614a 100%);
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  text-align: center;
  position: relative; overflow: hidden;
  padding: 90px 0 60px;
}
.impact::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 50% at 50% 60%, rgba(255,255,255,0.04) 0%, transparent 70%);
  pointer-events: none;
}
.impact-logo-bg {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: clamp(480px, 75%, 960px);
  opacity: 0.07;
  mix-blend-mode: screen;
  pointer-events: none;
  user-select: none;
  object-fit: contain;
}
.impact-inner { position: relative; z-index: 2; }
.impact-eyebrow {
  display: inline-block;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.22);
  color: #B9F5CC;
  padding: 6px 18px; border-radius: 20px;
  font-size: 12px; font-weight: 600; letter-spacing: 1.2px;
  text-transform: uppercase; margin-bottom: 28px;
  opacity: 0; animation: fadeInDown .7s .1s forwards;
}
.impact h1 {
  font-family: var(--serif);
  font-size: clamp(32px, 5.5vw, 62px);
  font-weight: 900;
  color: #fff;
  max-width: 820px; margin: 0 auto 24px;
  line-height: 1.1;
  opacity: 0; animation: fadeInUp .8s .3s forwards;
}
.impact h1 .highlight {
  color: #5EE88A;
  position: relative; display: inline-block;
}
.impact-sub {
  font-size: clamp(17px, 2.2vw, 22px);
  color: rgba(255,255,255,0.72);
  max-width: 600px; margin: 0 auto 44px;
  line-height: 1.6;
  opacity: 0; animation: fadeInUp .8s .55s forwards;
}
.impact-sub strong { color: #fff; font-weight: 700; }
.impact-cta {
  display: inline-block;
  background: #fff; color: var(--green);
  padding: 18px 48px; border-radius: 12px;
  font-size: 16px; font-weight: 700;
  border: none; cursor: pointer; font-family: var(--font);
  box-shadow: 0 8px 28px rgba(0,0,0,0.25);
  transition: all .25s;
  opacity: 0; animation: fadeInUp .8s .75s forwards;
}
.impact-cta:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(0,0,0,0.3); background: #f0fff4; }
.impact-hint {
  font-size: 13px; color: rgba(255,255,255,0.55);
  margin-top: 16px;
  opacity: 0; animation: fadeInUp .6s .95s forwards;
}

/* ── STATS ── */
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; padding: 56px 0 40px; }
.stat {
  text-align: center; padding: 24px 12px;
  background: var(--card);
  border-radius: 14px;
  border: 2px solid var(--border);
  position: relative; overflow: hidden;
  transition: all .3s cubic-bezier(.34,1.56,.64,1);
  opacity: 0; transform: translateY(24px);
}
.stat.visible { opacity: 1; transform: translateY(0); }
.stat::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(26,86,50,0.04) 0%, transparent 60%);
  opacity: 0; transition: opacity .3s;
}
.stat:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 12px 32px rgba(26,86,50,0.14); border-color: var(--green-mid); }
.stat:hover::before { opacity: 1; }
.stat-num { font-family: var(--serif); font-size: 34px; font-weight: 800; color: var(--green); }
.stat-label { font-size: 16px; font-weight: 700; color: var(--sub); margin-top: 6px; line-height: 1.4; }

/* ── SECTIONS ── */
.section { padding: 72px 0; }
.section-title, h2.section-title { text-align: center; font-family: var(--serif); font-size: 34px; font-weight: 700; color: var(--green); margin-bottom: 8px; margin-top: 0; }
.section-sub { text-align: center; color: var(--sub); font-size: 20px; font-weight: 700; margin: 0 0 48px 0; }

/* ── STEPS ── */
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.step {
  background: var(--card);
  border: 2px solid var(--border);
  border-radius: 16px; padding: 32px 24px; text-align: center;
  transition: all .3s cubic-bezier(.34,1.56,.64,1);
  position: relative; overflow: hidden;
  opacity: 0; transform: translateY(24px);
}
.step.visible { opacity: 1; transform: translateY(0); }
.step::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--green), #5EE88A, var(--green));
  background-size: 200% 100%;
  transform: scaleX(0); transform-origin: left;
  transition: transform .4s ease;
}
.step:hover { box-shadow: 0 12px 32px rgba(26,86,50,0.14); transform: translateY(-5px); border-color: var(--green-mid); }
.step:hover::after { transform: scaleX(1); animation: shimmer 1.5s infinite; }
.step-num { width: 44px; height: 44px; background: var(--green); color: #fff; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 20px; font-weight: 700; margin-bottom: 16px; }
.step h3 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: var(--green); }
.step p { font-size: 17px; font-weight: 600; color: var(--sub); line-height: 1.6; }

/* ── ALERT SECTION ── */
.alert-section { padding: 72px 0; background: var(--card); border-top: 2px solid var(--border); border-bottom: 2px solid var(--border); }
.alert-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.alert-phones { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.alert-phone {
  background: #E5DDD5; border-radius: 16px; padding: 16px;
  width: 220px; box-shadow: 0 8px 30px rgba(0,0,0,0.1);
  border: 2px solid var(--border);
  position: relative;
}
.alert-phone:nth-child(2) { margin-top: 40px; }
.alert-phone-label {
  text-align: center; font-size: 11px; font-weight: 700; color: var(--hint);
  margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;
}
.alert-wa-header { background: var(--green); color: #fff; padding: 8px 12px; border-radius: 10px 10px 0 0; margin: -16px -16px 12px; font-size: 14px; font-weight: 700; }
.alert-wa-msg { background: #fff; border-radius: 0 8px 8px 8px; padding: 10px 12px; margin-bottom: 6px; font-size: 13px; font-weight: 600; line-height: 1.5; }
.alert-wa-msg.bot { background: #DCF8C6; border-radius: 8px 0 8px 8px; }
.alert-wa-msg .time { font-size: 10px; color: #374151; text-align: right; margin-top: 3px; font-weight: 600; }
.alert-arrow {
  position: absolute;
  top: 50%; right: -36px;
  font-size: 28px; color: var(--green);
  transform: translateY(-50%);
}
.alert-text h3 { font-family: var(--serif); font-size: 30px; font-weight: 700; margin-bottom: 16px; color: var(--green); line-height: 1.2; }
.alert-text p { color: var(--sub); line-height: 1.7; font-size: 19px; font-weight: 700; margin-bottom: 14px; }
.alert-feat { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 17px; font-weight: 700; color: var(--sub); }
.alert-feat span { color: var(--green); font-size: 18px; font-weight: 700; flex-shrink: 0; }

/* ── FOR WHOM ── */
.whom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.whom-card {
  background: var(--card); border: 2px solid var(--border);
  border-radius: 16px; padding: 32px;
  transition: all .3s;
}
.whom-card:hover { border-color: var(--green-mid); box-shadow: 0 8px 24px rgba(26,86,50,0.1); }
.whom-card .emoji { font-size: 36px; margin-bottom: 12px; }
.whom-card h3 { font-family: var(--serif); font-size: 22px; font-weight: 700; color: var(--green); margin-bottom: 14px; }
.whom-card ul { list-style: none; }
.whom-card li { padding: 6px 0; font-size: 15px; font-weight: 600; color: var(--sub); display: flex; align-items: flex-start; gap: 8px; }
.whom-card li::before { content: '✓'; color: var(--green); font-weight: 700; flex-shrink: 0; }

/* ── TESTIMONIALS ── */
.testimonials { padding: 72px 0; background: var(--card); border-top: 2px solid var(--border); }
.testimonial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.testimonial {
  background: #fff; border: 2px solid var(--border);
  border-radius: 16px; padding: 28px 24px;
  transition: all .3s;
}
.testimonial:hover { border-color: var(--green-mid); box-shadow: 0 8px 24px rgba(26,86,50,0.1); transform: translateY(-2px); }
.testimonial .stars { color: #F5A623; font-size: 16px; margin-bottom: 12px; letter-spacing: 2px; }
.testimonial p { font-size: 17px; font-weight: 600; color: var(--sub); line-height: 1.6; margin-bottom: 14px; font-style: italic; }
.testimonial .author { font-size: 15px; font-weight: 700; color: var(--green); }

/* ── PRICING ── */
.pricing { padding: 72px 0; text-align: center; }
.pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 980px; margin: 0 auto; align-items: stretch; }
.price-card {
  background: #fff;
  border: 2px solid var(--border);
  border-radius: 20px; padding: 40px 32px;
  box-shadow: 0 12px 40px rgba(26,86,50,0.08);
  transition: all .3s;
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
}
.price-card.highlight { border-color: #B87333; border-width: 3px; box-shadow: 0 18px 52px rgba(184,115,51,0.22); }
.price-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 4px;
  background: linear-gradient(90deg, var(--green), #5EE88A, var(--green));
  background-size: 200% 100%;
  animation: shimmer 3s infinite;
}
.price-card.highlight::before {
  background: linear-gradient(90deg, #B87333, #D4A853, #B87333);
  background-size: 200% 100%;
  animation: shimmer 3s infinite;
}
.price-card:hover { transform: translateY(-4px); box-shadow: 0 20px 52px rgba(26,86,50,0.16); }
.price-badge { display: inline-block; background: var(--green); color: #fff; padding: 5px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
.price-badge.gold { background: linear-gradient(135deg, #B87333, #D4A853); }
.price-anchor { font-size: 16px; font-weight: 600; color: var(--hint); margin-bottom: 16px; line-height: 1.6; }
.price-anchor strong { color: var(--green); }
.price-anchor .old { text-decoration: line-through; color: #9CA3AF; font-size: 20px; margin-right: 8px; }
.price-amount { font-family: var(--serif); font-size: 52px; font-weight: 800; color: var(--green); }
.price-card.highlight .price-amount { color: #B87333; }
.price-per { font-size: 20px; font-weight: 700; color: var(--sub); }
.price-monthly { font-size: 18px; font-weight: 600; color: var(--hint); margin: 6px 0 20px; }
.price-guarantee {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--green-light); color: var(--green);
  padding: 8px 18px; border-radius: 20px;
  font-size: 14px; font-weight: 700; margin-bottom: 24px;
}
.price-features { text-align: left; margin-bottom: 28px; flex: 1; }
.price-feat { display: flex; align-items: center; gap: 10px; padding: 9px 0; font-size: 17px; font-weight: 700; color: var(--sub); border-bottom: 1px solid rgba(26,86,50,0.08); }
.price-feat:last-child { border-bottom: none; }
.price-feat span { color: var(--green); font-weight: 700; }
.price-card.highlight .price-feat span { color: #B87333; }
.price-cta { margin-top: auto; }
.plan-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0 18px; }
.plan-opt {
  border: 2px solid #E0E7E3; border-radius: 12px; padding: 14px 10px;
  cursor: pointer; text-align: center; transition: all .2s; background: #fff;
}
.plan-opt:hover { border-color: var(--green-mid); }
.plan-opt.selected { border-color: var(--green); background: var(--green-light); box-shadow: 0 0 0 3px rgba(26,86,50,0.12); }
.plan-opt.gold.selected { border-color: #B87333; background: #FBF5EC; box-shadow: 0 0 0 3px rgba(184,115,51,0.15); }
.plan-opt-name { font-size: 16px; font-weight: 700; color: var(--green); }
.plan-opt.gold .plan-opt-name { color: #B87333; }
.plan-opt-price { font-size: 15px; font-weight: 700; color: var(--sub); margin-top: 2px; }
.plan-opt-desc { font-size: 12px; font-weight: 600; color: var(--hint); margin-top: 4px; }

/* ── URGENCY ── */
.urgency {
  padding: 56px 0; text-align: center;
  background: linear-gradient(135deg, var(--green-dark), var(--green));
  color: #fff;
}
.urgency h2 { font-family: var(--serif); font-size: 28px; font-weight: 700; margin-bottom: 14px; }
.urgency p { font-size: 18px; font-weight: 600; opacity: 0.85; max-width: 600px; margin: 0 auto 28px; line-height: 1.6; }
.urgency-cta {
  display: inline-block;
  background: #fff; color: var(--green);
  padding: 16px 42px; border-radius: 12px;
  font-size: 16px; font-weight: 700;
  border: none; cursor: pointer; font-family: var(--font);
  box-shadow: 0 8px 28px rgba(0,0,0,0.25);
  transition: all .25s;
}
.urgency-cta:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(0,0,0,0.3); background: #f0fff4; }

/* ── MODAL ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 999; }
.modal { background: #fff; border-radius: 20px; padding: 40px; max-width: 440px; width: 92%; border: 2px solid var(--border); }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 17px; font-weight: 700; margin-bottom: 6px; color: var(--sub); }
.form-input { width: 100%; padding: 13px 14px; border: 1.5px solid #E0E7E3; border-radius: 10px; font-size: 18px; font-weight: 600; font-family: var(--font); outline: none; transition: border-color .2s; }
.form-input:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(26,86,50,0.08); }
.btn-primary {
  width: 100%; background: var(--green); color: #fff;
  padding: 16px; border-radius: 10px; font-size: 18px; font-weight: 700;
  border: none; cursor: pointer; font-family: var(--font);
  box-shadow: 0 4px 14px rgba(26,86,50,0.25);
  transition: all .2s;
}
.btn-primary:hover { background: var(--green-mid); transform: translateY(-2px); box-shadow: 0 8px 22px rgba(26,86,50,0.3); }

/* ── FAQ ── */
.faq { padding: 72px 0; }
.faq-item {
  border-bottom: 1px solid rgba(26,86,50,0.15);
  padding: 18px 0; cursor: pointer;
  transition: all .2s;
}
.faq-item:hover { padding-left: 8px; }
.faq-q { font-weight: 700; font-size: 19px; display: flex; justify-content: space-between; align-items: center; }
.faq-a { font-size: 17px; font-weight: 600; color: var(--sub); line-height: 1.6; margin-top: 10px; border-left: 3px solid var(--green); padding-left: 12px; }

/* ── FOOTER ── */
.footer { padding: 36px 0; border-top: 2px solid var(--border); text-align: center; background: var(--card); }
.footer p { font-size: 16px; font-weight: 600; color: var(--hint); }
.footer .disc { font-size: 14px; color: var(--hint); margin-top: 6px; font-style: italic; }

/* ── KEYFRAMES ── */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── RESPONSIVE ── */
@media(max-width:768px) {
  .impact h1 { font-size: 28px; }
  .impact-cta { padding: 15px 32px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stats .stat:last-child { grid-column: span 2; }
  .steps { grid-template-columns: 1fr; }
  .alert-grid { grid-template-columns: 1fr; }
  .alert-phones { flex-direction: column; align-items: center; }
  .alert-phone:nth-child(2) { margin-top: 0; }
  .whom-grid { grid-template-columns: 1fr; }
  .testimonial-grid { grid-template-columns: 1fr; }
  .pricing-grid { grid-template-columns: 1fr; }
  .plan-pick { grid-template-columns: 1fr; }
  .nav-logo { height: 18px; }
  .nav-cta { font-size: 12px; padding: 8px 16px; }
}
`;

const FAQS = [
  { q: "Meu pai/mãe não sabe mexer no WhatsApp direito. Vai funcionar?", a: "Só precisa responder 'SIM'. Uma palavra. Se souber mandar áudio, já sabe usar. A interface é 100% via chat — nada de menus, botões ou apps novos." },
  { q: "E se ele(a) ignorar os lembretes?", a: "No plano Ouro, após 30 minutos sem resposta você — e outros familiares cadastrados — recebem um alerta automático no WhatsApp. Você decide se liga, manda mensagem ou vai até lá." },
  { q: "Posso cadastrar mais de um familiar para receber o alerta?", a: "Sim, no plano Ouro. Cadastre quantos quiser: irmãos, netos, cuidadores. Todos recebem o alerta ao mesmo tempo quando algo não é confirmado." },
  { q: "Quanto tempo leva para configurar?", a: "De 5 a 10 minutos. Você digita os remédios da sua mãe/pai em linguagem natural ou envia uma foto da receita. Nossa IA identifica tudo automaticamente." },
  { q: "Tem suporte se algo der errado?", a: "Sim. Suporte humano via WhatsApp. Resposta rápida, em minutos, direto no chat." },
  { q: "E se eu quiser cancelar?", a: "Cancele a qualquer momento, sem multa. Ou use a garantia de 7 dias e receba 100% do valor de volta." },
  { q: "Como eu sei que isso realmente funciona?", a: "O Lembrymed não depende da memória da sua mãe — depende da nossa. Se ela não confirmar em 30 minutos, o sistema alerta você automaticamente. +XXX famílias usam hoje com taxa de adesão à medicação acima de 85%." },
  { q: "Isso substitui médico ou cuidador?", a: "Não. O Lembrymed é um aliado — garante que o tratamento prescrito pelo médico seja seguido. Para casos que exigem cuidado humano presencial, mantenha seu médico e cuidador." },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Logo({ h, white }: { h: number; white?: boolean }) {
  return (
    <img
      src="/logo-new.png"
      alt="Lembrymed"
      style={{ height: h, objectFit: "contain" as const, filter: white ? "brightness(0) invert(1)" : "none" }}
    />
  );
}

export default function LembrymedLanding() {
  const [show, setShow] = useState(false);
  const [faq, setFaq] = useState(-1);
  const [plan, setPlan] = useState<"SILVER" | "GOLD">("SILVER");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const stats = useReveal();
  const steps = useReveal();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === '1') {
      setShow(true);
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) setShow(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, loading]);

  return (<>
    <style>{S}</style>

    {/* ── NAV ── */}
    <nav className="nav">
      <div className="container nav-inner">
        <Logo h={22} />
        <button className="nav-cta" onClick={() => setShow(true)}>Saber se ela tomou hoje →</button>
      </div>
    </nav>

    <main>

    {/* ── HERO ── */}
    <section className="impact">
      <img className="impact-logo-bg" src="/logo-new.png" alt="" aria-hidden="true" />
      <div className="container impact-inner">
        <div className="impact-eyebrow">📊 OMS · Drugs & Aging · ScienceDirect</div>
        <h1>
          7 em cada 10 idosos abandonam<br/>
          o tratamento em 3 meses.<br/>
          <span className="highlight">Se for sua mãe, você só descobre<br/>
          na próxima emergência.</span>
        </h1>
        <p className="impact-sub">
          <strong>Não é descuido.</strong> É polifarmácia, esquecimento, rotina confusa.<br/>
          <strong>125 mil mortes por ano</strong> são causadas por não-adesão a medicamentos.<br/>
          <span style={{color:'#5EE88A',fontWeight:700}}>A boa notícia: tem solução simples. Pelo WhatsApp que ela já usa.</span>
          <br/>
          <a
            href="https://apps.who.int/iris/handle/10665/42682"
            target="_blank"
            rel="noopener noreferrer"
            style={{fontSize:13, color:'rgba(255,255,255,0.88)', textDecoration:'underline', marginTop:12, display:'inline-block'}}
          >
            Fonte: OMS — Adherence to Long-term Therapies · Drugs & Aging (2024) · ScienceDirect
          </a>
        </p>
        <button className="impact-cta" onClick={() => setShow(true)}>
          Quero saber se ela tomou os remédios hoje →
        </button>
        <div className="impact-hint">+XXX famílias já protegidas · 100% WhatsApp · Sem app</div>
      </div>
    </section>

    {/* ── STATS ── */}
    <section className="container">
      <div ref={stats.ref} className="stats">
        {[
          { num: "65%",  label: "dos idosos com múltiplas condições não tomam os remédios prescritos" },
          { num: "93%",  label: "dos idosos brasileiros usam medicamento de uso contínuo" },
          { num: "125 mil", label: "mortes por ano por não-adesão — evite a próxima" },
          { num: "Na hora",  label: "você recebe alerta se algo sair do planejado — sem app" },
          { num: "10 min", label: "é o tempo médio para um familiar configurar tudo" },
        ].map((s, i) => (
          <div
            key={i}
            className={`stat${stats.visible ? " visible" : ""}`}
            style={{ transitionDelay: `${i * 90}ms` }}
          >
            <div className="stat-num">{s.num}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>

    {/* ── COMO FUNCIONA ── */}
    <section className="section">
      <div className="container">
        <h2 className="section-title">Como funciona</h2>
        <p className="section-sub">Você configura. Ela recebe. Você fica tranquilo.</p>
        <div ref={steps.ref} className="steps">
          {[
            { n: "1", h: "Você cadastra em 5 minutos", p: "Nossa IA lê a receita da sua mãe em segundos. Você só envia uma foto ou digita os nomes dos remédios — o resto é automático." },
            { n: "2", h: "Ela recebe", p: "2 lembretes por dose: na hora exata e uma confirmação 10 minutos depois. Sua mãe só precisa responder 'SIM'. Sem app, sem senha, sem complicação." },
            { n: "3", h: "Você é avisado", p: "No plano Ouro, se ela não responder em 30 minutos, você recebe um alerta no seu WhatsApp. Na mesma hora." },
          ].map((s, i) => (
            <div
              key={i}
              className={`step${steps.visible ? " visible" : ""}`}
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              <div className="step-num">{s.n}</div>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── ALERTA AO FAMILIAR ── */}
    <section className="alert-section">
      <div className="container">
        <h2 className="section-title" style={{marginBottom:8}}>A paz de espírito que você procura</h2>
        <p className="section-sub">Porque o problema não é o remédio. É não saber se foi tomado.</p>
        <div className="alert-grid">
          <div className="alert-phones">
            <div className="alert-phone">
              <div className="alert-phone-label">🧓 Celular da mãe</div>
              <div className="alert-wa-header">Lembrymed</div>
              <div className="alert-wa-msg bot">💊 Hora da sua Losartana 50mg<br/>Responda SIM para confirmar<div className="time">08:00</div></div>
              <div className="alert-wa-msg bot">⚠️ Não recebemos sua confirmação. Estamos aguardando.<div className="time">08:30</div></div>
            </div>
            <div className="alert-phone">
              <div className="alert-phone-label">👨‍👩‍👧 Celular do familiar</div>
              <div className="alert-wa-header" style={{background:"#C0392B"}}>⚠️ Lembrymed — Alerta</div>
              <div className="alert-wa-msg bot" style={{border:"1.5px solid #E74C3C"}}>🚨 Maria não confirmou a medicação das 08:00.<br/><br/>Losartana 50mg<br/>⏰ Horário: 08:00<br/>📅 Hoje<br/><br/>Entre em contato com ela.<div className="time">08:30</div></div>
            </div>
          </div>
          <div className="alert-text">
            <h3>Você não precisa ligar todo dia.</h3>
            <p>Não precisa confiar na memória. Não precisa sentir aquela angústia de 'será que ela tomou?'.</p>
            <div className="alert-feat"><span>✓</span> Se algo sair do planejado, <strong>você fica sabendo na hora</strong></div>
            <div className="alert-feat"><span>✓</span> Se der tudo certo, você <strong>dorme tranquilo</strong></div>
            <div className="alert-feat"><span>✓</span> Cadastre <strong>quantos familiares quiser</strong> — todos recebem o alerta</div>
            <div style={{display:"inline-block",marginTop:14,background:"linear-gradient(135deg,#B87333,#D4A853)",color:"#fff",padding:"6px 16px",borderRadius:20,fontSize:13,fontWeight:700}}>
              ⭐ Recurso do plano Ouro
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ── PARA QUEM É ── */}
    <section className="section">
      <div className="container">
        <h2 className="section-title">Feito para quem cuida de quem importa</h2>
        <p className="section-sub">Duas personas, uma solução.</p>
        <div className="whom-grid">
          <div className="whom-card">
            <div className="emoji">🧓</div>
            <h3>Para quem toma</h3>
            <ul>
              <li>Idosos com 2 ou mais medicamentos de uso contínuo</li>
              <li>Pessoas com rotina de múltiplos horários</li>
              <li>Pacientes recém-saídos de internação</li>
              <li>Quem não quer instalar aplicativo nenhum</li>
            </ul>
          </div>
          <div className="whom-card" style={{borderColor:"var(--green-mid)",borderWidth:3,background:"#F0F7F3"}}>
            <div className="emoji">👨‍👩‍👧</div>
            <h3>Para quem cuida</h3>
            <ul>
              <li>Filhos que moram longe e se preocupam</li>
              <li>Netos que querem ajudar os avós</li>
              <li>Familiares que já perderam noites de sono</li>
              <li>Quem quer paz de espírito por <strong>R$ 0,40/dia</strong></li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    {/* ── PROVA SOCIAL ── */}
    <section className="testimonials">
      <div className="container">
        <h2 className="section-title">Famílias reais, tranquilidade real</h2>
        <p className="section-sub">Quem já usa recomenda.</p>
        <div className="testimonial-grid">
          <div className="testimonial">
            <div className="stars">★★★★★</div>
            <p>"Descobri que minha mãe ficou 3 dias sem tomar o remédio do coração. Agora o Lembrymed me avisa na hora se algo der errado. Semana passada eu soube às 8:30 que ela não confirmou — liguei e resolvi."</p>
            <div className="author">— Ricardo M., filho da Dona Cleusa, Belo Horizonte</div>
          </div>
          <div className="testimonial">
            <div className="stars">★★★★★</div>
            <p>"Meu pai saiu do hospital com 6 medicações. Em 3 dias ele já estava confuso. Achei que ia ter que contratar cuidador. O Lembrymed organizou tudo — enviei foto da receita e a IA fez o resto."</p>
            <div className="author">— Ana P., filha do Seu Antônio, São Paulo</div>
          </div>
          <div className="testimonial">
            <div className="stars">★★★★★</div>
            <p>"Moro em outra cidade e sempre ficava angustiado: 'será que a vovó tomou?'. Agora recebo a confirmação no meu WhatsApp. Se algo der errado, eu sou o primeiro a saber. Durmo tranquilo."</p>
            <div className="author">— Lucas T., neto da Dona Iolanda, Curitiba</div>
          </div>
        </div>
      </div>
    </section>

    {/* ── PRICING ── */}
    <section className="pricing">
      <div className="container">
        <h2 className="section-title">Escolha o plano ideal para a sua família</h2>
        <p className="section-sub">Sem surpresas, sem taxas escondidas</p>
        <div className="pricing-grid">

          {/* ── PLANO PRATA ── */}
          <div className="price-card">
            <div className="price-badge">Plano Prata</div>
            <div className="price-amount">R$ 149</div><div className="price-per">/ano</div>
            <div className="price-monthly">Equivale a R$ 12,42/mês</div>
            <div className="price-guarantee">🛡️ 7 dias de garantia incondicional</div>
            <div className="price-features">
              {[
                "Lembretes ilimitados via WhatsApp",
                "Medicamentos ilimitados",
                "2 lembretes por dose (na hora + confirmação)",
                "Cadastro por texto ou foto da receita",
                "Histórico de confirmações",
                "100% WhatsApp — sem app",
                "Suporte humano via WhatsApp",
                "7 dias de garantia — reembolso total",
              ].map(f => (
                <div key={f} className="price-feat"><span>✓</span> {f}</div>
              ))}
            </div>
            <div className="price-cta">
              <button className="btn-primary" onClick={() => { setPlan("SILVER"); setShow(true); }}>
                Assinar Prata — R$ 149/ano →
              </button>
            </div>
          </div>

          {/* ── PLANO OURO ── */}
          <div className="price-card highlight">
            <div className="price-badge gold">⭐ Plano Ouro — Mais completo</div>
            <div className="price-anchor">
              <span className="old">R$ 339</span>
            </div>
            <div className="price-amount">R$ 239</div><div className="price-per">/ano</div>
            <div className="price-monthly">Equivale a R$ 19,92/mês</div>
            <div className="price-guarantee">🛡️ 7 dias de garantia incondicional</div>
            <div className="price-features">
              {[
                "Tudo do plano Prata",
                "⚠️ Alerta ao cuidador: familiar avisado se ela não confirmar",
                "Cadastre quantos familiares quiser",
                "Relatórios mensais de adesão",
                "Medicamentos semanais e mensais",
                "Prioridade no suporte humano",
              ].map(f => (
                <div key={f} className="price-feat"><span>✓</span> {f}</div>
              ))}
            </div>
            <div className="price-cta">
              <button className="btn-primary" style={{background:"linear-gradient(135deg,#B87333,#D4A853)", boxShadow:"0 4px 14px rgba(184,115,51,0.3)"}}
                onClick={() => { setPlan("GOLD"); setShow(true); }}>
                Assinar Ouro — R$ 239/ano →
              </button>
            </div>
          </div>

        </div>
        <div style={{textAlign:"center",fontSize:13,color:"var(--hint)",marginTop:20,fontWeight:600}}>
          🔒 Pagamento seguro via Stripe (cartão, Pix ou boleto) · Dados protegidos pela LGPD
        </div>
      </div>
    </section>

    {/* ── MODAL DE ASSINATURA ── */}
    {show && (
      <div
        className="modal-overlay"
        onClick={() => { if (!loading) setShow(false); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
      >
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <Logo h={44} />
            <div id="checkout-title" style={{color:"var(--sub)",fontSize:14,marginTop:8,fontWeight:600}}>
              Assinatura Anual — {plan === "GOLD" ? "Plano Ouro" : "Plano Prata"}
            </div>
          </div>

          {/* ── Seletor de plano ── */}
          <div className="plan-pick">
            <div
              className={`plan-opt${plan === "SILVER" ? " selected" : ""}`}
              onClick={() => setPlan("SILVER")}
            >
              <div className="plan-opt-name">Prata</div>
              <div className="plan-opt-price">R$ 149/ano</div>
              <div className="plan-opt-desc">Lembretes ilimitados</div>
            </div>
            <div
              className={`plan-opt gold${plan === "GOLD" ? " selected" : ""}`}
              onClick={() => setPlan("GOLD")}
            >
              <div className="plan-opt-name">Ouro</div>
              <div className="plan-opt-price">R$ 239/ano</div>
              <div className="plan-opt-desc">+ Alerta ao cuidador e relatórios</div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="cf-name">Seu nome completo</label>
            <input id="cf-name" className="form-input" placeholder="João da Silva"
              autoComplete="name" required
              value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div className="form-group">
            <label htmlFor="cf-email">E-mail</label>
            <input id="cf-email" className="form-input" type="email" placeholder="joao@email.com"
              autoComplete="email" inputMode="email" required
              value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div className="form-group">
            <label htmlFor="cf-phone">WhatsApp (com DDD)</label>
            <input id="cf-phone" className="form-input" type="tel" placeholder="11 99999-9999"
              autoComplete="tel" inputMode="tel" required
              value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          </div>

          <div style={{display:"flex",gap:10,alignItems:"flex-start",margin:"12px 0 16px",fontSize:13,lineHeight:1.5,color:"var(--sub)"}}>
            <input
              id="cf-consent"
              type="checkbox"
              checked={consentAccepted}
              onChange={e => setConsentAccepted(e.target.checked)}
              style={{marginTop:3,width:16,height:16,accentColor:"var(--green)",cursor:"pointer",flexShrink:0}}
            />
            <label htmlFor="cf-consent" style={{cursor:"pointer"}}>
              Li e aceito a <a href="/privacidade" target="_blank" rel="noopener" style={{color:"var(--green)",fontWeight:700,textDecoration:"underline"}}>Política de Privacidade</a> e os
              {' '}<a href="/termos" target="_blank" rel="noopener" style={{color:"var(--green)",fontWeight:700,textDecoration:"underline"}}>Termos de Uso</a>.
              Autorizo o tratamento dos meus dados de saúde para envio dos lembretes via WhatsApp, conforme Lei 13.709/2018 (LGPD).
            </label>
          </div>

          {formError && (
            <div role="alert" aria-live="polite" style={{color:"#c00",fontSize:15,fontWeight:600,marginBottom:8,textAlign:"center"}}>
              {formError}
            </div>
          )}
          <button
            className="btn-primary"
            style={{opacity:loading?0.7:1,cursor:loading?"not-allowed":"pointer"}}
            disabled={loading}
            onClick={async () => {
              setFormError("");
              if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
                setFormError("Preencha todos os campos para continuar.");
                return;
              }
              if (!consentAccepted) {
                setFormError("Para prosseguir, aceite a Política de Privacidade e os Termos.");
                return;
              }
              setLoading(true);
              try {
                const res = await fetch("/api/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: form.name.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    plan,
                    consentAccepted: true,
                    consentVersion: 'v1.0-2026-04-22',
                  }),
                });
                const data = await res.json();
                if (!res.ok || !data.url) {
                  setFormError(data.error || "Erro ao iniciar pagamento. Tente novamente.");
                  setLoading(false);
                  return;
                }
                window.location.href = data.url;
              } catch {
                setFormError("Erro de conexão. Verifique sua internet e tente novamente.");
                setLoading(false);
              }
            }}
          >
            {loading ? "Aguarde..." : plan === "GOLD" ? "Pagar Ouro — R$ 239/ano com cartão ou Pix →" : "Pagar Prata — R$ 149/ano com cartão ou Pix →"}
          </button>
          <div style={{textAlign:"center",fontSize:11,color:"var(--hint)",marginTop:12}}>
            🔒 Pagamento 100% seguro via Stripe
          </div>
        </div>
      </div>
    )}

    {/* ── FAQ ── */}
    <section className="faq"><div className="container">
      <h2 className="section-title">Perguntas frequentes</h2>
      <div style={{maxWidth:680,margin:"24px auto 0"}}>
        {FAQS.map((f, i) => (
          <div className="faq-item" key={i} onClick={() => setFaq(faq === i ? -1 : i)}>
            <div className="faq-q">{f.q} <span style={{fontSize:20,color:"var(--green)"}}>{faq === i ? "−" : "+"}</span></div>
            {faq === i && <div className="faq-a">{f.a}</div>}
          </div>
        ))}
      </div>
    </div></section>

    {/* ── URGÊNCIA ── */}
    <section className="urgency">
      <div className="container">
        <h2>Você vai dormir tranquilo hoje sabendo que ela tomou os remédios?</h2>
        <p>125 mil mortes por ano por não-adesão. Não espere o próximo susto para agir.</p>
        <button className="urgency-cta" onClick={() => setShow(true)}>
          Quero dormir tranquilo hoje →
        </button>
      </div>
    </section>

    </main>

    <footer className="footer"><div className="container">
      <Logo h={28} />
      <p style={{marginTop:8}}>BIZZ.IA Intelligence Ecosystem © 2026</p>
      <p className="disc">Este serviço não substitui orientação médica profissional.</p>
    </div></footer>
  </>);
}
