import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import styles from './Navbar.module.css';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.logo}>
        <span className={styles.logoIcon}>✦</span>
        SnapCleain
      </Link>

      <div className={styles.actions}>
        {user ? (
          <>
            {subscription.isActive && (
              <span className={styles.planBadge}>
                {subscription.planName}
              </span>
            )}
            <Link to="/pricing" className={styles.link}>Planes</Link>
            <button onClick={handleSignOut} className={styles.signOutBtn}>
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <Link to="/pricing" className={styles.link}>Planes</Link>
            <Link to="/auth" className={styles.ctaBtn}>Iniciar sesión</Link>
          </>
        )}
      </div>
    </nav>
  );
}