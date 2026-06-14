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

// Message joined with prospect + client for the approval queue
export interface QueueItem extends MessageRow {
  prospect: ProspectRow | null;
  client: ClientRow | null;
}
