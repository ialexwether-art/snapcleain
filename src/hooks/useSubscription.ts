import { useState, useEffect } from 'react';
import { getActiveSubscription } from '../lib/stripe';
import { STRIPE_PRODUCTS } from '../stripe-config';
import { useAuth } from './useAuth';

export interface SubscriptionInfo {
  isActive: boolean;
  planName: string | null;
  priceId: string | null;
  status: string | null;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    isActive: false,
    planName: null,
    priceId: null,
    status: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubscription({ isActive: false, planName: null, priceId: null, status: null });
      setLoading(false);
      return;
    }

    getActiveSubscription()
      .then((data) => {
        if (data) {
          const product = STRIPE_PRODUCTS.find((p) => p.priceId === data.price_id);
          setSubscription({
            isActive: true,
            planName: product?.name ?? 'Plan Activo',
            priceId: data.price_id,
            status: data.status,
          });
        } else {
          setSubscription({ isActive: false, planName: null, priceId: null, status: null });
        }
      })
      .catch(() => {
        setSubscription({ isActive: false, planName: null, priceId: null, status: null });
      })
      .finally(() => setLoading(false));
  }, [user]);

  return { subscription, loading };
}