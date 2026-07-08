/**
 * @module Tipos compartilhados das respostas da API Admin
 *
 * Importados pelo front Next.js para tipar `useState`/`useFetch`,
 * substituindo o uso de `useState<any>(null)` que escondia regressões
 * de contrato entre backend e frontend.
 *
 * Onda 4 / M5.
 */

// ─── /admin/dashboard ───────────────────────────────────────────────────────

export interface DashboardResponse {
  activePatients: number;
  mrr: number;
  arr: number;
  msgsToday: number;
  deliveryRate: number;
  confirmRate: number;
  churnRate: number;
  newPatients30d: number;
  onboardingPending: number;
  /** Ticket médio em R$ (float, calculado da base real) */
  ticketMedio: number;
  /** Indicador de timezone usado nas métricas (sempre 'America/Sao_Paulo') */
  _tz: string;
}

// ─── /admin/dashboard/new-subs ──────────────────────────────────────────────

export interface NewSubscribersDay {
  day: string; // YYYY-MM-DD
  count: number | string; // Postgres pode devolver bigint como string
}

// ─── /admin/dashboard/revenue ───────────────────────────────────────────────

export interface RevenueMonth {
  month: string; // YYYY-MM
  total_cents: number | string;
  count: number | string;
}

// ─── /admin/patients (lista paginada) ───────────────────────────────────────

export interface PatientListRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  onboarding_step: string;
  is_active: boolean;
  created_at: string; // ISO
  med_count: number | string;
  confirmed_today: number | string;
  missed_today: number | string;
  last_activity: string | null;
}

export interface PatientListResponse {
  patients: PatientListRow[];
  total: number;
  page: number;
  limit: number;
}

// ─── /admin/patients/:phone (detalhe) ───────────────────────────────────────

export interface PatientDetailMed {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  instructions: string | null;
  isActive: boolean | null;
  createdAt: string | null;
}

export interface PatientDetailFamilyContact {
  id: string;
  name: string;
  phone: string;
  isActive: boolean | null;
  createdAt: string | null;
}

export interface PatientDetailSubscription {
  id: string;
  plan: string | null;
  status: string | null;
  amountCents: number;
  startsAt: string;
  expiresAt: string;
}

export interface PatientDetail {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  onboardingStep: string | null;
  agentSessionId: string | null;
  interactionMode: string | null;
  onboardingNudgeCount: number | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  medications: PatientDetailMed[];
  familyContacts: PatientDetailFamilyContact[];
  subscriptions: PatientDetailSubscription[];
}

export interface PatientHistoryRow {
  date: string;
  medication_time: string;
  confirmation_status: 'confirmed' | 'denied' | 'no_response';
  confirmed_at: string | null;
  family_alerted: boolean | null;
  med_name: string;
  dosage: string;
}

export interface PatientDetailResponse {
  patient: PatientDetail;
  history: PatientHistoryRow[];
}

// ─── /admin/queue ───────────────────────────────────────────────────────────

export interface QueueJobCounts {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueDeliveryMetrics {
  sent_24h: number;
  failed_24h: number;
  confirmed_24h: number;
  denied_24h: number;
  delivery_rate: number | null;
  confirm_rate: number | null;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  openedAt?: string;
}

export interface QueueResponse {
  reminders: QueueJobCounts;
  familyAlerts: QueueJobCounts;
  delivery: QueueDeliveryMetrics;
  circuit_breaker: CircuitBreakerState;
}

// ─── /admin/queue/errors ────────────────────────────────────────────────────

export interface QueueErrorRow {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  medication_name: string;
  dosage: string;
  reminder_type: string;
  medication_time: string;
  scheduled_for: string;
  error_message: string;
  created_at: string;
}

export interface QueueErrorsResponse {
  count: number;
  errors: QueueErrorRow[];
}

// ─── /admin/onboarding-funnel ───────────────────────────────────────────────

export interface OnboardingFunnelRow {
  onboarding_step: string;
  count: number | string;
  last_7d: number | string;
}

export interface OnboardingFunnelResponse {
  funnel: OnboardingFunnelRow[];
  stuck_count: number;
}

// ─── /admin/renewals ────────────────────────────────────────────────────────

export interface RenewalRow {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  expires_at: string;
  days_to_expire: number;
  renewal_reminder_30d_sent: boolean;
  renewal_reminder_15d_sent: boolean;
  renewal_reminder_3d_sent: boolean;
}

export interface RenewalsResponse {
  expiring: RenewalRow[];
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  expiresIn: string;
}

export interface AdminMeResponse {
  email: string;
}
