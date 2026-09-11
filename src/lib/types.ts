export type OpenMicStatus = 'upcoming' | 'completed' | 'cancelled';
export type RegistrationStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type AttendanceStatus = 'unmarked' | 'attended' | 'absent';
export type EventStatus = 'upcoming' | 'completed' | 'cancelled';
export type KomikaStatus = 'active' | 'archived';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface OpenMic {
  id: string;
  title: string;
  slug: string;
  poster: string | null;
  date: string;
  time: string;
  venue: string;
  location: string;
  maps_url: string | null;
  description: string | null;
  capacity: number;
  status: OpenMicStatus;
  registration_status: 'open' | 'closed';
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface OpenMicRegistration {
  id: string;
  registration_id: string;
  open_mic_id: string;
  komika_id: string | null;
  full_name: string;
  stage_name: string;
  community: string | null;
  instagram: string | null;
  whatsapp: string | null;
  notes: string | null;
  status: RegistrationStatus;
  attendance_status: AttendanceStatus;
  created_at: string;
  updated_at: string;
}

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  poster: string | null;
  date: string;
  time: string;
  venue: string;
  location: string;
  maps_url: string | null;
  description: string | null;
  event_rules?: string | null;
  status: EventStatus;
  registration_status: 'open' | 'closed';
  published: boolean;
  whatsapp_number: string;
  whatsapp_message: string | null;
  ticket_price: number;
  created_at: string;
  updated_at: string;
}

export interface EventTicket {
  id: string;
  event_id: string;
  name: string;
  price: number;
  description: string | null;
  ticket_url: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityApplication {
  id: string;
  full_name: string;
  whatsapp: string;
  instagram: string | null;
  city: string | null;
  interests: string[];
  notes: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  registration_id: string;
  full_name: string;
  stage_name: string | null;
  community: string | null;
  whatsapp: string;
  instagram: string | null;
  notes: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface Komika {
  id: string;
  full_name: string;
  whatsapp: string | null;
  stage_name: string;
  slug: string;
  photo: string | null;
  bio: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  specialties: string[];
  joined_at: string | null;
  featured_order: number | null;
  status: KomikaStatus;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteSettings {
  id: number;
  site_name: string;
  site_short_name: string;
  logo_url: string | null;
  brand_primary: string;
  brand_hover: string;
  brand_accent: string;
  whatsapp_admin: string;
  whatsapp_admin_name?: string | null;
  whatsapp_registration?: string | null;
  whatsapp_registration_name?: string | null;
  whatsapp_partnership?: string | null;
  whatsapp_partnership_name?: string | null;
  whatsapp_ticket?: string | null;
  whatsapp_ticket_name?: string | null;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  address: string;
  short_description: string;
  affiliation_name?: string | null;
  affiliation_website?: string | null;
  affiliation_logo_url?: string | null;
}

export const LOGO_URL = '/assets/images/Standupindo_CIlegon_Logo.jpeg';
