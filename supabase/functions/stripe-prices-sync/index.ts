import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'Bolt Integration', version: '1.0.0' },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const AUTO_PLAN_AMOUNTS: Record<string, number> = {
  aficionado: 399,
  limpieza_total: 799,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      const prices = await stripe.prices.list({
        active: true,
        limit: 100,
        expand: ['data.product'],
      });

      const formatted = prices.data
        .filter((p) => p.recurring !== null && p.recurring !== undefined)
        .map((p) => {
          const product = p.product && typeof p.product === 'object' && (p.product as Stripe.Product).object === 'product'
            ? (p.product as Stripe.Product)
            : null;
          const recurring = p.recurring as Stripe.Price.Recurring;
          return {
            id: p.id,
            product_id: p.product as string,
            product_name: product?.name ?? null,
            unit_amount: p.unit_amount,
            currency: p.currency,
            interval: recurring?.interval ?? null,
            interval_count: recurring?.interval_count ?? null,
            active: p.active,
          };
        });

      const { data: mapping, error: mapError } = await supabase
        .from('stripe_price_map')
        .select('plan_key, price_id');

      if (mapError) {
        console.error('Failed to read price map', mapError);
        return jsonResponse({ error: 'Failed to read current price mapping' }, 500);
      }

      const mapped = new Map((mapping ?? []).map((row) => [row.plan_key, row.price_id]));

      for (const [planKey, amount] of Object.entries(AUTO_PLAN_AMOUNTS)) {
        if (mapped.has(planKey)) continue;
        const match = formatted.find(
          (p) => p.unit_amount === amount && p.interval === 'month' && p.currency === 'eur',
        );
        if (!match) continue;
        const { error: upsertError } = await supabase
          .from('stripe_price_map')
          .upsert({ plan_key: planKey, price_id: match.id, updated_at: new Date().toISOString() }, { onConflict: 'plan_key' });
        if (upsertError) {
          console.error('Failed to auto-assign price', upsertError);
          continue;
        }
        mapped.set(planKey, match.id);
      }

      return jsonResponse({
        prices: formatted,
        mapping: Object.fromEntries(mapped),
      });
    }

    if (req.method === 'POST') {
      const { plan_key, price_id } = await req.json();

      if (typeof plan_key !== 'string' || !plan_key.trim()) {
        return jsonResponse({ error: 'Missing or invalid plan_key' }, 400);
      }
      if (typeof price_id !== 'string' || !price_id.startsWith('price_')) {
        return jsonResponse({ error: 'Missing or invalid price_id' }, 400);
      }

      const { error: upsertError } = await supabase
        .from('stripe_price_map')
        .upsert({ plan_key, price_id, updated_at: new Date().toISOString() }, { onConflict: 'plan_key' });

      if (upsertError) {
        console.error('Failed to save price mapping', upsertError);
        return jsonResponse({ error: 'Failed to save price mapping' }, 500);
      }

      return jsonResponse({ ok: true, plan_key, price_id });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('stripe-prices-sync error', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
