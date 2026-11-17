export interface UserSession {
  id: number;
  employee_code: string;
  email: string;
  full_name: string;
  role: 'colaborador' | 'rrhh';
  department: string;
  position: string;
  hire_date: string;
  next_payment_date?: string | null;
  next_review_date?: string | null;
}

export interface SystemStatus {
  environment: string;
  database_mode: string;
  drive_mode: string;
  llm_mode: string;
  timezone: string;
  demo_mode: boolean;
  active_policies_count: number;
  active_chunks_count: number;
}

export interface Citation {
  drive_file_id: string;
  policy_code: string;
  title: string;
  section: string;
  version: string;
  effective_date: string;
  owner: string;
  drive_url: string;
  snippet: string;
  score?: number;
}

export interface ChatMessage {
  id: number;
  trace_id: string;
  session_id: string;
  question: string;
  answer: string;
  intent: string;
  agent_used: string;
  prompt_version: string;
  topic: string;
  citations: Citation[];
  latency_ms: number;
  outcome: string;
  needs_hr_escalation: boolean;
  suggested_ticket_summary?: string | null;
  helpful?: boolean | null;
  created_at: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  updated_at: string;
}

export interface BalanceOut {
  year: number;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  available_days: number;
  expiration_date: string;
  years_of_service?: number;
  period_start?: string | null;
  period_end?: string | null;
  anniversary_date?: string | null;
  next_anniversary_date?: string | null;
  six_month_deadline?: string | null;
  origin_note?: string;
}

export interface LeaveRequestOut {
  id: number;
  employee_name?: string;
  department?: string;
  request_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
  reason?: string | null;
  approver_notes?: string | null;
  created_at: string;
}

export interface DisabilityOut {
  id: number;
  folio_imss: string;
  disability_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string;
}

export interface MyDataResponse {
  employee: UserSession;
  balances: BalanceOut[];
  recent_requests: LeaveRequestOut[];
  disabilities: DisabilityOut[];
  updated_at: string;
}

export interface TicketHistoryItem {
  id: number;
  actor_name: string;
  action: string;
  notes: string;
  created_at: string;
}

export interface TicketOut {
  id: number;
  folio: string;
  employee_name: string;
  department: string;
  topic: string;
  confirmed_summary: string;
  status: string;
  assigned_to: string;
  is_sensitive: boolean;
  created_at: string;
  updated_at: string;
  history: TicketHistoryItem[];
}

export interface DocumentOut {
  id: number;
  drive_file_id: string;
  policy_code: string;
  title: string;
  mime_type: string;
  version: string;
  effective_date: string;
  owner: string;
  drive_url: string;
  status: string;
  chunks_count: number;
  last_synced_at: string;
}

export interface DocumentAlertOut {
  id: number;
  drive_file_id: string;
  title: string;
  alert_type: string;
  severity: string;
  detail: string;
  status: 'activa' | 'revisada' | 'resuelta' | string;
  occurrence_count: number;
  resolved: boolean;
  last_seen_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface DocumentsStatusResponse {
  last_synced_at?: string | null;
  total_active_documents: number;
  total_chunks: number;
  documents: DocumentOut[];
  alerts: DocumentAlertOut[];
}

export interface DashboardReport {
  report_date: string;
  absences_today: number;
  pending_requests: number;
  pending_over_3_days: number;
  active_disabilities: number;
  resolved_without_escalation_pct: number;
  monthly_disability_days: number;
  monthly_hires: number;
  monthly_exits: number;
  turnover_rate_pct: number;
  employees_over_20_vacation_days: number;
  prev_day_chat_volume: number;
  prev_day_avg_latency_ms: number;
  executive_summary: string;
  payload_json: {
    absences_last_30_days: { date: string; label: string; absences: number }[];
    top_5_topics: { topic: string; count: number }[];
    absences_by_type: { name: string; value: number }[];
    absences_by_department: { department: string; count: number }[];
    today_absent_records?: {
      employee_id: number;
      department: string;
      request_type: string;
      is_disability: boolean;
    }[];
    departments_catalog?: string[];
    pending_requests_list: {
      id: number;
      employee_name: string;
      department: string;
      request_type: string;
      start_date: string;
      end_date: string;
      days_count: number;
      days_waiting: number;
      is_over_3_days: boolean;
    }[];
    unanswered_questions: {
      question: string;
      topic: string;
      count?: number;
      last_asked_at?: string;
      created_at?: string;
    }[];
    active_headcount: number;
  };
  generated_at: string;
}
