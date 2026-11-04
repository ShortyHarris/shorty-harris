// Where a campaign is in its pipeline, for the client's campaign view (Oct 7
// feedback item 8). Research and writing can take days, so the client needs to
// see which stage it is in and how far along, instead of an empty screen.

export interface CampaignProgressInput {
  status: string;              // campaigns.status
  scrapeStatus: string | null; // campaigns.scrape_status
  prospects: number;           // prospects found
  written: number;             // prospects with a first email written (live or sent)
  awaiting: number;            // prospects with a draft waiting for this client's approval
  sent: number;                // first emails sent
}

export type CampaignStageKey =
  | 'in_review' | 'paused' | 'finished' | 'needs_attention'
  | 'researching' | 'writing' | 'awaiting_approval' | 'sending' | 'ready';

export interface CampaignStage {
  key: CampaignStageKey;
  label: string;
  detail: string;
  /** Show the "this can take a few days" note. */
  slow: boolean;
}

export function campaignStage(i: CampaignProgressInput): CampaignStage {
  if (i.status === 'pending_review' || i.status === 'draft') {
    return { key: 'in_review', label: 'In review', detail: 'Our team checks the setup, then starts finding prospects.', slow: true };
  }
  if (i.status === 'paused') {
    return { key: 'paused', label: 'Paused', detail: 'Nothing is found or sent while the campaign is paused.', slow: false };
  }
  if (i.status === 'cancelled' || i.status === 'completed') {
    return { key: 'finished', label: i.status === 'completed' ? 'Completed' : 'Cancelled', detail: 'No new prospects are being added.', slow: false };
  }
  if (i.scrapeStatus === 'error' || i.scrapeStatus === 'failed') {
    return { key: 'needs_attention', label: 'Needs attention', detail: "Finding prospects stopped with an error. Our team has been alerted.", slow: false };
  }
  if (i.scrapeStatus === 'running' || i.scrapeStatus === 'queued' || (i.prospects === 0 && i.scrapeStatus !== 'complete')) {
    return { key: 'researching', label: 'Researching prospects', detail: 'Finding businesses that match your search terms and locations.', slow: true };
  }
  if (i.prospects === 0) {
    return { key: 'needs_attention', label: 'Needs attention', detail: 'The search found no businesses with a usable email. Try broader search terms or more locations.', slow: false };
  }
  if (i.awaiting > 0) {
    return { key: 'awaiting_approval', label: 'Awaiting your approval', detail: `${i.awaiting} ${i.awaiting === 1 ? 'prospect has' : 'prospects have'} emails ready for you to review. Nothing is sent until you approve.`, slow: false };
  }
  if (i.written < i.prospects && i.sent === 0) {
    return { key: 'writing', label: 'Generating emails', detail: `Personalized emails written for ${i.written} of ${i.prospects} prospects so far.`, slow: true };
  }
  if (i.sent > 0) {
    return { key: 'sending', label: 'Active', detail: `First emails sent to ${i.sent} of ${i.prospects} prospects. Follow-ups go out on schedule after you approve them.`, slow: false };
  }
  return { key: 'ready', label: 'Ready to launch', detail: 'Approved emails start sending in the next send window.', slow: false };
}

export interface ProgressStep { label: string; count: number; done: boolean }

/** The four counts shown as a strip: found, written, awaiting approval, sent. */
export function progressSteps(i: CampaignProgressInput): ProgressStep[] {
  return [
    { label: 'Prospects found', count: i.prospects, done: i.prospects > 0 },
    { label: 'Emails written', count: i.written, done: i.prospects > 0 && i.written >= i.prospects },
    { label: 'Awaiting your approval', count: i.awaiting, done: i.written > 0 && i.awaiting === 0 },
    { label: 'First emails sent', count: i.sent, done: i.prospects > 0 && i.sent >= i.prospects },
  ];
}
