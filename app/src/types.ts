// ---- Admin types ----
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type SendStatus = 'not_sent' | 'queued' | 'scheduled' | 'sent' | 'failed' | 'blocked_dnc';
export type MessageType = 'initial' | 'follow_up_d3' | 'follow_up_d7' | 'follow_up_d14';
export type PipelineStatus = 'new' | 'contacted' | 'replied' | 'hot_lead' | 'won' | 'lost';

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
  created_at: string;
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
}

// ---- Client types ----
export type HotLeadStatus = 'new' | 'viewed' | 'contacted' | 'won' | 'lost';

export interface HotLead {
  id: string;
  prospect_id: string;
  ai_summary: string | null;
  suggested_action: string | null;
  status: HotLeadStatus;
  routed_at: string;
  prospect: {
    id: string;
    business_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    category: string | null;
    location: string | null;
  } | null;
  reply: { body: string } | null;
}

export interface ClientSummary {
  business_name: string;
  credits_remaining: number;
  messagesSent: number;
  replies: number;
  hotLeads: number;
}
