import { Session } from '@supabase/supabase-js';

export async function createCheckoutSession(
  priceId: string,
  session: Session,
): Promise<string> {
  const origin = window.location.origin;

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId,
        successUrl: `${origin}/success`,
        cancelUrl: `${origin}/pricing`,
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'No se pudo iniciar el proceso de pago.');
  }

  const data = await response.json();
  return data.url as string;
}