import { supabase } from './supabase';

export async function createCheckoutSession(priceId: string, mode: 'subscription' | 'payment') {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        price_id: priceId,
        mode,
        success_url: `${window.location.origin}/success`,
        cancel_url: `${window.location.origin}/pricing`,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create checkout session');
  }

  const { url } = await response.json();
  return url;
}

export async function getActiveSubscription() {
  const { data, error } = await supabase
    .from('stripe_subscriptions')
    .select('*')
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  if (error) throw error;
  return data;
}