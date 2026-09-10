/*
# Add ticket_price column to events table

1. Changes
- Add `ticket_price` column to `events` table as integer with default 0.
- This allows admin to set a single ticket price per event directly on the event record.
- Value is stored as integer (e.g. 50000 means Rp 50.000). 0 means GRATIS.

2. Notes
- Existing events will get default value 0 (GRATIS).
- No data is lost — this is purely additive.
- The separate event_tickets table remains untouched for backward compatibility.
*/

ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_price integer NOT NULL DEFAULT 0;
