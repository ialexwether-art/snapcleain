import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getProductByPriceId, StripeProduct } from '@/stripe-config';

type SubscriptionRow = {
  subscription_status: string | null;
  price_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean | null;
};

export function useSubscription(userId: string | undefined) {
  const [data, setData] = useState<SubscriptionRow | null>(null);
  const [product, setProduct] = useState<StripeProduct | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    async function fetch() {
      const { data: row } = await supabase
        .from('stripe_user_subscriptions')
        .select('subscription_status, price_id, current_period_end, cancel_at_period_end')
        .maybeSingle();

      if (row) {
        setData(row);
        if (row.price_id) setProduct(getProductByPriceId(row.price_id));
      }
      setLoading(false);
    }

    fetch();
  }, [userId]);

  const isActive =
    data?.subscription_status === 'active' ||
    data?.subscription_status === 'trialing';

  return { data, product, loading, isActive };
}