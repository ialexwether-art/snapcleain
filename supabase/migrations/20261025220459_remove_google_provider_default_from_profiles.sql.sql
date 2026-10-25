/*
# Remove Google provider default from profiles

1. Modified Tables
- `profiles`
  - Changed `provider` column default from `'google'` to `'email'`.
  - Updated any existing rows where `provider = 'google'` to `'email'`.

2. Security
- No policy changes. RLS stays enabled.

3. Notes
- The app authenticates with Supabase Auth (email/password) and does not read or
  write the `profiles.provider` column. This change only removes a leftover
  default value from a previous Google/Apple login design that is no longer used.
- No user data is lost: the column is kept, only its default changes.
*/

ALTER TABLE profiles ALTER COLUMN provider SET DEFAULT 'email';

UPDATE profiles SET provider = 'email' WHERE provider = 'google';
