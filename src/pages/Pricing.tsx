import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STRIPE_PRODUCTS } from '../stripe-config';
import { createCheckoutSession } from '../lib/stripe';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import styles from './Pricing.module.css';

export function Pricing() {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, mode: 'subscription' | 'payment') => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setLoadingPriceId(priceId);
    setError(null);

    try {
      const url = await createCheckoutSession(priceId, mode);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar el pago');
      setLoadingPriceId(null);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div className={styles.badge}>Planes y precios</div>
        <h1 className={styles.title}>Elige tu plan</h1>
        <p className={styles.subtitle}>
          Empieza con lo básico o desbloquea todo el potencial de SnapCleain.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {STRIPE_PRODUCTS.map((product, index) => {
          const isPremium = index === STRIPE_PRODUCTS.length - 1;
          const isCurrentPlan = subscription.priceId === product.priceId;
          const isLoading = loadingPriceId === product.priceId;

          return (
            <div
              key={product.id}
              className={`${styles.card} ${isPremium ? styles.featured : ''}`}
            >
              {isPremium && <div className={styles.featuredBadge}>Más popular</div>}

              <div className={styles.cardHeader}>
                <h2 className={styles.planName}>{product.name}</h2>
                <div className={styles.priceRow}>
                  <span className={styles.currency}>{product.currencySymbol}</span>
                  <span className={styles.price}>{product.price.toFixed(2)}</span>
                  <span className={styles.period}>/mes</span>
                </div>
                <p className={styles.description}>{product.description}</p>
              </div>

              <ul className={styles.features}>
                {product.features.map((feature) => (
                  <li key={feature} className={styles.feature}>
                    <span className={styles.check}>✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={`${styles.cta} ${isPremium ? styles.ctaPrimary : styles.ctaSecondary} ${isCurrentPlan ? styles.ctaActive : ''}`}
                onClick={() => !isCurrentPlan && handleCheckout(product.priceId, product.mode)}
                disabled={isLoading || isCurrentPlan}
              >
                {isLoading ? (
                  <span className={styles.spinner} />
                ) : isCurrentPlan ? (
                  'Plan actual ✓'
                ) : (
                  'Suscribirse'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}