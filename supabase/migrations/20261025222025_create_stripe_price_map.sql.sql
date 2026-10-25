/*
# Stripe price mapping table

1. New Tables
- `stripe_price_map`
  - `plan_key` (text, primary key) — internal plan identifier ("aficionado", "limpieza_total")
  - `price_id` (text, not null) — Stripe Price ID assigned to the plan
  - `updated_at` (timestamptz, default now())

2. Purpose
- Stores which Stripe Price ID is assigned to each subscription plan in the app.
- The frontend reads this table to know which `price_id` to send to stripe-checkout,
  instead of hardcoding IDs in the code. This lets the app owner re-sync prices
  from Stripe without code changes.
- The edge function `stripe-prices-sync` writes to this table after the owner
  picks a price in the admin screen.

3. Security
- Enable RLS on `stripe_price_map`.
- This is shared config read by every visitor (signed-in or not) so the frontend
  knows which price to use at checkout. SELECT is allowed for anon + authenticated.
- Writes are done by the edge function using the service role key (bypasses RLS),
  so no INSERT/UPDATE/DELETE policy is granted to anon/authenticated. The edge
  function is the only writer.
*/

CREATE TABLE IF NOT EXISTS stripe_price_map (
  plan_key text PRIMARY KEY,
  price_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stripe_price_map ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON stripe_price_map TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_price_map" ON stripe_price_map;
CREATE POLICY "anon_select_price_map"
ON stripe_price_map FOR SELECT
TO anon, authenticated USING (true);
