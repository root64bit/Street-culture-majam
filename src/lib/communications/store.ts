import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Subscriber = {
  id: string;
  email: string;
  status: 'pending' | 'subscribed' | 'unsubscribed';
  confirmation_hash: string | null;
  confirmation_expires_at: string | null;
  consent_version: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
};
export type Campaign = {
  id: string;
  subject: string;
  body: string;
  status: 'draft' | 'sending' | 'sent';
  created_by: string | null;
  created_at: string;
  send_started_at: string | null;
  sent_at: string | null;
};
type EmailDelivery = {
  id: string;
  payload_hash: string;
  status: 'pending' | 'accepted';
  operation_id: string | null;
  created_at: string;
};
type CampaignDelivery = {
  campaign_id: string;
  subscriber_id: string;
  status: 'pending' | 'accepted' | 'failed';
  operation_id: string | null;
  created_at: string;
};
type CommunicationsDatabase = {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Database['public']['Tables'] & {
      auth_email_deliveries: Table<EmailDelivery, 'id' | 'payload_hash' | 'status'>;
      newsletter_subscribers: Table<Subscriber, 'email'>;
      newsletter_campaigns: Table<Campaign, 'subject' | 'body'>;
      newsletter_deliveries: Table<CampaignDelivery, 'campaign_id' | 'subscriber_id'>;
    };
    Functions: Database['public']['Functions'] & {
      claim_newsletter_batch: {
        Args: { target_campaign_id: string };
        Returns: { subscriber_id: string; email: string }[];
      };
    };
  };
};

export function communicationsAdmin() {
  return createAdminClient() as unknown as SupabaseClient<CommunicationsDatabase>;
}
