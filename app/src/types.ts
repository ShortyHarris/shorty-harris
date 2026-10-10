// ---- Admin types ----
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type SendStatus = 'not_sent' | 'queued' | 'scheduled' | 'sent' | 'failed' | 'blocked_dnc';
export type MessageType = 'initial' | 'follow_up_d3' | 'follow_up_d7' | 'follow_up_d14';
export type PipelineStatus = 'new' | 'contacted' | 'replied' | 'hot_lead' | 'won' | 'lost' | 'generation_failed' | 'message_pending' | 'bounced';

export interface MessageRow {
  id: string;
  prospect_id: string;
  campaign_id: string;
  client_id: string;
  channel: string;
  subject: string | null;
  body: string;
  message_type: MessageType;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  send_status: SendStatus;
  opened_at: string | null;
  open_count: number;
  created_at: string;
  sender_email: string | null;
  sender_status: string | null;
}

export interface ProspectRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  location: string | null;
  pipeline_status: PipelineStatus;
}

export interface ClientRow {
  id: string;
  business_name: string;
  business_type: string | null;
}

export interface QueueItem extends MessageRow {
  prospect: ProspectRow | null;
  client: ClientRow | null;
  originalOpenedAt: string | null;
  originalOpenCount: number;
}

// ---- Client types ----
export type HotLeadStatus = 'new' | 'viewed' | 'contacted' | 'won' | 'lost';
export type CallOutcomeValue = 'rejected' | 'call_later' | 'meeting_agreed';

export interface HotLeadReply {
  body: string;
  received_at: string;
}

// Shape returned by the hot_lead_queue(p_client_id) RPC - see
// set_hot_lead_outcome for the only sanctioned way to change `status`.
export interface HotLead {
  hot_lead_id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: HotLeadStatus;
  ai_summary: string | null;
  suggested_action: string | null;
  routed_at: string;
  first_viewed_at: string | null;
  contacted_at: string | null;
  closed_at: string | null;
  outcome_note: string | null;
  call_outcome: CallOutcomeValue | null;
  nudge_count: number;
  escalated: boolean;
  // Only set while status is 'new' or 'viewed'.
  hours_waiting: number | null;
  // The reply that caused this lead - null for rows created before WF6
  // started storing reply_id. Fall back to latest_reply in that case.
  reply: HotLeadReply | null;
  latest_reply: HotLeadReply | null;
}

export interface ClientSummary {
  business_name: string;
  credits_remaining: number;
  messagesSent: number;
  replies: number;
  hotLeads: number;
}

export interface ClientMessageItem {
  id: string;
  prospect_id: string;
  campaign_id?: string | null;
  channel: string;
  subject: string | null;
  body: string;
  message_type: MessageType;
  approval_status: ApprovalStatus;
  created_at: string;
  prospect: {
    id: string;
    business_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    category: string | null;
    location: string | null;
  } | null;
}
