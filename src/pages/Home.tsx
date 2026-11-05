import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.css';

export function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <div className={styles.badge}>Limpieza inteligente</div>
        <h1 className={styles.title}>
          Detecta manchas.<br />
          <span className={styles.gradient}>Limpia mejor.</span>
        </h1>
        <p className={styles.subtitle}>
          SnapCleain analiza tus manchas con IA y te da el tratamiento exacto para eliminarlas. Rápido, preciso y sin esfuerzo.
        </p>
        <div className={styles.ctas}>
          <Link to="/pricing" className={styles.primaryCta}>Ver planes</Link>
          <Link to="/auth" className={styles.secondaryCta}>Empezar gratis</Link>
        </div>
      </div>

      <div className={styles.features}>
        {[
          { icon: '🔍', title: 'Escaneo IA', desc: 'Identifica el tipo de mancha al instante con nuestra IA avanzada.' },
          { icon: '📋', title: 'Historial completo', desc: 'Guarda y consulta todos tus escaneos anteriores en cualquier momento.' },
          { icon: '✨', title: 'Trucos avanzados', desc: 'Accede a técnicas de lavado profesionales adaptadas a cada mancha.' },
        ].map((f) => (
          <div key={f.title} className={styles.featureCard}>
            <span className={styles.featureIcon}>{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}