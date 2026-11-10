import { supabase } from '@/lib/supabase';

export interface PublicTicketOffering {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quota: number | null;
  ticket_url: string | null;
  available_public: boolean;
  available_ots: boolean;
  ots_price: number | null;
  sort_order: number;
  sold_out: boolean;
  temporarily_unavailable: boolean;
  remaining_tickets: number | null;
}

interface PublicTicketAvailabilityResponse {
  error?: string;
  tickets: PublicTicketOffering[];
}

export async function fetchPublicTicketOfferings(eventId: string): Promise<PublicTicketOffering[]> {
  const { data, error } = await supabase.functions.invoke<PublicTicketAvailabilityResponse>('ticketing-public', {
    body: { action: 'ticket-availability', event_id: eventId },
  });
  if (error) throw new Error(error.message);
  if (!data || data.error || !Array.isArray(data.tickets)) {
    throw new Error(data?.error ?? 'Ketersediaan tiket gagal diperiksa. Coba segarkan halaman.');
  }
  return data.tickets;
}
