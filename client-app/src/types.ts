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
