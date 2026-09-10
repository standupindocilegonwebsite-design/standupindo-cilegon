-- Create admin auth user
-- Email: admin@standupindocilegon.id
-- Password: StandupCilegon2026!

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@standupindocilegon.id',
  crypt('StandupCilegon2026!', gen_salt('bf')),
  now(),
  now(),
  now(),
  now(),
  '{"role":"admin"}'::jsonb,
  '{}'::jsonb,
  false,
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@standupindocilegon.id');

-- Also create identity entry
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider_id,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'admin@standupindocilegon.id',
  'email',
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email = 'admin@standupindocilegon.id'
AND NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = u.id);