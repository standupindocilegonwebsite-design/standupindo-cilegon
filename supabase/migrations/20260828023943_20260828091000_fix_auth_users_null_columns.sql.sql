/*
# Fix: Repair NULL auth.users columns causing "Database error querying schema"

## Overview
The admin user `admin@standupindocilegon.id` was created via a manual SQL INSERT
into `auth.users` (not through the Supabase Auth API). Several columns that the
GoTrue Auth service expects to be non-NULL strings were left NULL:

- `confirmation_token`
- `email_change`
- `email_change_token_new`
- `recovery_token`

When GoTrue tries to scan these columns during password login, it encounters
`converting NULL to string is unsupported` and returns a generic
`500: Database error querying schema` to the client.

## Root Cause
Reference: https://github.com/supabase/auth/issues/1940
The GoTrue Auth service (Supabase Auth) expects these four columns to contain
at least an empty string. When they are NULL, the SQL scan fails and login
returns a 500 error. This happens when users are created via raw SQL INSERT
instead of the Auth API (signUp / admin.createUser).

## Fix
Update the affected rows in `auth.users` to set these columns to empty strings
where they are currently NULL. This is safe — these are token columns that are
only populated during active confirmation/recovery/email-change flows; an empty
string is the correct "no active token" state.

## Security
- This does NOT modify any passwords, emails, or authentication credentials.
- This does NOT change any RLS policies or role memberships.
- This does NOT bypass authentication — it fixes a data integrity issue so
  that the existing auth provider can function correctly.
- The fix only touches rows where these columns are NULL, setting them to the
  value the Auth service itself would use when no token is active.

## Important Notes
1. This is idempotent — re-running it is a no-op since it only updates NULL values.
2. No user data is lost or modified beyond setting empty token strings.
3. After applying, the Supabase Auth API password login will function correctly.
4. This matches the official Supabase troubleshooting guidance:
   https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44
*/

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE confirmation_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR recovery_token IS NULL;
