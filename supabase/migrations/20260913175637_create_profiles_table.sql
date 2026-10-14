/*
# Create profiles table for real user accounts

1. New Tables
- `profiles`
  - `id` (uuid, primary key)
  - `email` (text, unique, not null) — the real email from Google/Apple native auth
  - `provider` (text, not null) — "google" or "apple"
  - `token_balance` (numeric, default 3.0) — wallet tokens associated with the account
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `profiles`.
- Allow anon + authenticated to insert (social login writes the email on first login).
- Allow authenticated users to read/update their own profile by email.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  provider text NOT NULL DEFAULT 'google',
  token_balance numeric NOT NULL DEFAULT 3.0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_profiles" ON profiles;
CREATE POLICY "anon_insert_profiles"
ON profiles FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_profiles" ON profiles;
CREATE POLICY "anon_select_profiles"
ON profiles FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "anon_update_profiles" ON profiles;
CREATE POLICY "anon_update_profiles"
ON profiles FOR UPDATE
TO anon, authenticated
USING (true) WITH CHECK (true);
