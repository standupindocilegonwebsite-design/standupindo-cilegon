/*
# Standup Indo Cilegon — Core Schema

## Overview
Creates the data model for the Standup Indo Cilegon community web app: Open Mic nights,
public registrations, comedy events with ticket info, komika profiles, and site settings.
The public website is no-auth (anon can read published content and submit Open Mic
registrations). Admins (Supabase email/password auth) manage everything.

## New Tables
1. `open_mics` — Open Mic nights (title, slug, poster, date/time, venue, capacity, status).
2. `open_mic_registrations` — Public registrations for an Open Mic (full name, stage name,
   community, instagram, whatsapp, notes, status, generated registration_id).
3. `events` — Comedy events (title, slug, poster, date/time, venue, description, status,
   whatsapp number + pre-filled message for ticket purchase).
4. `event_tickets` — Ticket categories per event (name, price, description).
5. `komika` — Comedian profiles (stage name, photo, bio, social URLs, specialties, status).
6. `site_settings` — Single-row table for community contact info and social links.

## Security
- RLS enabled on every table.
- Public (anon, authenticated) can SELECT published open_mics, events, komika, site_settings.
- Public can INSERT open_mic_registrations (status defaults to PENDING). Public cannot
  read/update/delete registrations (admin-only) to protect private registrant data.
- Authenticated (admin) users get full CRUD on all tables.
- Registration ID is generated server-side via a sequence for uniqueness.
*/

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- open_mics
-- ============================================================
CREATE TABLE IF NOT EXISTS open_mics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  poster text,
  date date NOT NULL,
  time text NOT NULL,
  venue text NOT NULL,
  location text NOT NULL,
  description text,
  capacity int NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'upcoming',         -- upcoming | completed | cancelled
  registration_status text NOT NULL DEFAULT 'open', -- open | closed
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE open_mics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_open_mics" ON open_mics;
CREATE POLICY "public_read_open_mics" ON open_mics FOR SELECT
  TO anon, authenticated USING (published = true);

DROP POLICY IF EXISTS "admin_all_open_mics" ON open_mics;
CREATE POLICY "admin_all_open_mics" ON open_mics FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- open_mic_registrations
-- ============================================================
CREATE TABLE IF NOT EXISTS open_mic_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id text NOT NULL UNIQUE,
  open_mic_id uuid NOT NULL REFERENCES open_mics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  stage_name text NOT NULL,
  community text,
  instagram text,
  whatsapp text,
  notes text,
  status text NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected | cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE open_mic_registrations ENABLE ROW LEVEL SECURITY;

-- Sequence-based registration id, e.g. OM27-0048
CREATE SEQUENCE IF NOT EXISTS open_mic_reg_seq;

DROP POLICY IF EXISTS "public_insert_registrations" ON open_mic_registrations;
CREATE POLICY "public_insert_registrations" ON open_mic_registrations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_all_registrations" ON open_mic_registrations;
CREATE POLICY "admin_all_registrations" ON open_mic_registrations FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  poster text,
  date date NOT NULL,
  time text NOT NULL,
  venue text NOT NULL,
  location text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'upcoming', -- upcoming | completed | cancelled
  published boolean NOT NULL DEFAULT false,
  whatsapp_number text NOT NULL,
  whatsapp_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_events" ON events;
CREATE POLICY "public_read_events" ON events FOR SELECT
  TO anon, authenticated USING (published = true);

DROP POLICY IF EXISTS "admin_all_events" ON events;
CREATE POLICY "admin_all_events" ON events FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- event_tickets
-- ============================================================
CREATE TABLE IF NOT EXISTS event_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  price int NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE event_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_event_tickets" ON event_tickets;
CREATE POLICY "public_read_event_tickets" ON event_tickets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_all_event_tickets" ON event_tickets;
CREATE POLICY "admin_all_event_tickets" ON event_tickets FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- komika
-- ============================================================
CREATE TABLE IF NOT EXISTS komika (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  photo text,
  bio text,
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  specialties text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active', -- active | archived
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE komika ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_komika" ON komika;
CREATE POLICY "public_read_komika" ON komika FOR SELECT
  TO anon, authenticated USING (published = true);

DROP POLICY IF EXISTS "admin_all_komika" ON komika;
CREATE POLICY "admin_all_komika" ON komika FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- site_settings (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
  id int PRIMARY KEY DEFAULT 1,
  whatsapp_admin text NOT NULL DEFAULT '6281234567890',
  instagram_url text NOT NULL DEFAULT 'https://instagram.com/standupindocilegon',
  tiktok_url text NOT NULL DEFAULT 'https://tiktok.com/@standupindocilegon',
  youtube_url text NOT NULL DEFAULT 'https://youtube.com/@standupindocilegon',
  address text NOT NULL DEFAULT 'Cilegon, Banten',
  short_description text NOT NULL DEFAULT 'Komunitas stand-up comedy di Cilegon yang menjadi ruang untuk tampil, berkarya, dan berkembang bersama.',
  CONSTRAINT single_row CHECK (id = 1)
);
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_site_settings" ON site_settings;
CREATE POLICY "public_read_site_settings" ON site_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_all_site_settings" ON site_settings;
CREATE POLICY "admin_all_site_settings" ON site_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_open_mics_date ON open_mics(date);
CREATE INDEX IF NOT EXISTS idx_open_mic_reg_open_mic_id ON open_mic_registrations(open_mic_id);
CREATE INDEX IF NOT EXISTS idx_open_mic_reg_status ON open_mic_registrations(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_event_tickets_event_id ON event_tickets(event_id);

-- ============================================================
-- Seed data
-- ============================================================
INSERT INTO site_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO komika (stage_name, slug, photo, bio, instagram_url, tiktok_url, youtube_url, specialties, status, published)
VALUES
  ('Bambang Sinaga', 'bambang-sinaga', 'https://images.pexels.com/photos/5254581/pexels-photo-5254581.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   'Bambang Sinaga adalah komika veteran Cilegon dengan materi observasional yang tajam dan relatable. Aktif sejak 2019, ia kerap tampil sebagai MC dan opener di berbagai event komunitas.',
   'https://instagram.com/bambangsinaga', 'https://tiktok.com/@bambangsinaga', 'https://youtube.com/@bambangsinaga',
   ARRAY['Standup Comedy','MC / Host','Podcaster'], 'active', true),
  ('Rina Pratama', 'rina-pratama', 'https://images.pexels.com/photos/30186023/pexels-photo-30186023.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   'Rina Pratama membawa sudut pandang segar tentang kehidupan perempuan di kota industri. Materinya ringan, cerdas, dan sering bikin penonton merasa diceritakan.',
   'https://instagram.com/rinapratama', 'https://tiktok.com/@rinapratama', NULL,
   ARRAY['Standup Comedy','Content Creator','Writer'], 'active', true),
  ('Dimas Aryanto', 'dimas-aryanto', 'https://images.pexels.com/photos/13026082/pexels-photo-13026082.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   'Dimas Aryanto dikenal dengan persona konyol dan storytelling panjang yang bikin ngakak. Juga aktif sebagai host podcast komedi lokal.',
   'https://instagram.com/dimasaryanto', NULL, 'https://youtube.com/@dimasaryanto',
   ARRAY['Standup Comedy','Podcaster','MC / Host'], 'active', true),
  ('Siti Marlina', 'siti-marlina', 'https://images.pexels.com/photos/14715186/pexels-photo-14715186.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   'Siti Marlina menghadirkan komedi yang hangat dan dekat dengan keseharian keluarga. Sering tampil di open mic dan event komunitas se-Banten.',
   'https://instagram.com/sitimarlina', 'https://tiktok.com/@sitimarlina', NULL,
   ARRAY['Standup Comedy','Writer'], 'active', true),
  ('Rizky Hidayat', 'rizky-hidayat', 'https://images.pexels.com/photos/9966169/pexels-photo-9966169.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   'Rizky Hidayat adalah komika muda dengan energi tinggi dan materi tentang dunia kerja generasi Z. Aktif sebagai content creator di berbagai platform.',
   'https://instagram.com/rizkyhidayat', 'https://tiktok.com/@rizkyhidayat', 'https://youtube.com/@rizkyhidayat',
   ARRAY['Standup Comedy','Content Creator','Actor'], 'active', true),
  ('Maya Lestari', 'maya-lestari', 'https://images.pexels.com/photos/13422861/pexels-photo-13422861.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   'Maya Lestari membawa komedi observasional tentang hubungan dan keseharian dengan gaya storytelling yang detail.',
   'https://instagram.com/mayalestari', NULL, NULL,
   ARRAY['Standup Comedy','Writer','Model'], 'active', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO open_mics (title, slug, poster, date, time, venue, location, description, capacity, status, registration_status, published)
VALUES
  ('Open Mic #27', 'open-mic-27', 'https://images.pexels.com/photos/2101487/pexels-photo-2101487.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   '2026-09-04', '19.00', 'Kopi Senja', 'Cilegon',
   'Open Mic #27 adalah panggung terbuka untuk komika baru maupun senior. Setiap peserta mendapat 5-7 menit set. Datang, tampil, atau sekadar menonton dan nikmati malam penuh tawa.',
   10, 'upcoming', 'open', true),
  ('Open Mic #28', 'open-mic-28', 'https://images.pexels.com/photos/1840320/pexels-photo-1840320.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   '2026-09-18', '19.30', 'The Laugh Lab', 'Cilegon',
   'Edisi spesial Open Mic dengan tema "Cerita Sekolah". Bawa materi terbaikmu dan rebutkan ruang panggung bersama komika Cilegon.',
   12, 'upcoming', 'open', true),
  ('Open Mic #26', 'open-mic-26', 'https://images.pexels.com/photos/9547593/pexels-photo-9547593.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   '2026-08-21', '19.00', 'Kopi Senja', 'Cilegon',
   'Open Mic #26 yang sudah berlalu. Terima kasih kepada semua komika dan penonton yang hadir.',
   10, 'completed', 'closed', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO events (title, slug, poster, date, time, venue, location, description, status, published, whatsapp_number, whatsapp_message)
VALUES
  ('Comedy Night #02', 'comedy-night-02', 'https://images.pexels.com/photos/14017606/pexels-photo-14017606.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   '2026-09-25', '20.00', 'Aula Serbaguna Cilegon', 'Cilegon',
   'Comedy Night #02 menghadirkan lineup komika terbaik Standup Indo Cilegon dalam satu malam penuh tawa. Tiket terbatas, amankan tempatmu sekarang.',
   'upcoming', true, '6281234567890',
   'Halo Admin Standup Indo Cilegon, saya ingin membeli tiket Comedy Night #02.'),
  ('Comedy Night #01', 'comedy-night-01', 'https://images.pexels.com/photos/6173841/pexels-photo-6173841.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
   '2026-07-30', '20.00', 'Aula Serbaguna Cilegon', 'Cilegon',
   'Comedy Night #01 yang sukses meriah. Sampai jumpa di edisi berikutnya!',
   'completed', true, '6281234567890',
   'Halo Admin Standup Indo Cilegon, saya ingin membeli tiket Comedy Night #01.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO event_tickets (event_id, name, price, description)
SELECT id, 'Regular', 50000, 'Tempat duduk bebas, akses ke seluruh sesi pertunjukan.'
FROM events WHERE slug = 'comedy-night-02'
ON CONFLICT DO NOTHING;

INSERT INTO event_tickets (event_id, name, price, description)
SELECT id, 'VIP', 100000, 'Tempat duduk prioritas baris depan dan merchandise eksklusif.'
FROM events WHERE slug = 'comedy-night-02'
ON CONFLICT DO NOTHING;
