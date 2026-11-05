import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../hooks/useSubscription';
import styles from './Success.module.css';

export function Success() {
  const { subscription, loading } = useSubscription();
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, [loading]);

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <div className={styles.icon}>✓</div>
          <div className={styles.ring} />
        </div>

        <h1 className={styles.title}>¡Pago completado!</h1>

        {loading ? (
          <p className={styles.loading}>Activando tu plan{dots}</p>
        ) : subscription.isActive ? (
          <>
            <p className={styles.subtitle}>
              Tu suscripción al <strong>{subscription.planName}</strong> está activa.
              Ya puedes disfrutar de todas las funciones incluidas.
            </p>
            <div className={styles.planChip}>{subscription.planName} activo</div>
          </>
        ) : (
          <p className={styles.subtitle}>
            Tu pago fue procesado correctamente. Tu plan se activará en breve.
          </p>
        )}

        <div className={styles.actions}>
          <Link to="/" className={styles.primaryBtn}>Ir al inicio</Link>
          <Link to="/pricing" className={styles.secondaryBtn}>Ver planes</Link>
        </div>
      </div>
    </main>
  );
}