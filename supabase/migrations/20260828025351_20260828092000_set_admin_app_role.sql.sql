/*
# Set the existing admin account application role

## Overview
Marks the existing Supabase Auth account for
`admin@standupindocilegon.id` as an administrator using immutable
`raw_app_meta_data`.

## Modified data
- `auth.users.raw_app_meta_data.role`: set to `admin` for the existing
  confirmed admin account only.
- No password, email, session, or user-editable metadata is changed.

## Security
- Authorization data is stored in `raw_app_meta_data`, which users cannot
  change through the normal client Auth API.
- The dashboard will require a valid Supabase session whose app metadata role
  is `admin`.
- No RLS policies are disabled or widened.

## Important notes
1. This update is limited to the known admin email and is idempotent.
2. A new login is required for the updated role claim to appear in a JWT.
3. The frontend still uses only the public anon key; no service credential is
   exposed to the browser.
*/
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'::jsonb,
  true
)
WHERE email = 'admin@standupindocilegon.id';
