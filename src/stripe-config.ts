export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  currencySymbol: string;
  mode: 'subscription' | 'payment';
  features: string[];
}

export const STRIPE_PRODUCTS: StripeProduct[] = [
  {
    id: 'prod_VRpR3xYndZBhCi',
    priceId: 'price_1URq7HPsxn1Onc5hb1YSzQ6L',
    name: 'Plan Básico',
    description: '5 escaneos semanales, acceso completo al historial guardado de manchas y soporte inteligente con anuncios activos.',
    price: 3.99,
    currency: 'eur',
    currencySymbol: '€',
    mode: 'subscription',
    features: [
      '5 escaneos semanales',
      'Historial completo de manchas',
      'Soporte inteligente',
      'Con anuncios',
    ],
  },
  {
    id: 'prod_VRpVJJTqjtNMps',
    priceId: 'price_1URq7HPsxn1Onc5hcSr6Ibvf',
    name: 'Plan Premium',
    description: 'Escaneos de manchas 100% ilimitados, acceso completo al historial, trucos de lavados avanzados y sin anuncios.',
    price: 7.99,
    currency: 'eur',
    currencySymbol: '€',
    mode: 'subscription',
    features: [
      'Escaneos ilimitados',
      'Historial completo de manchas',
      'Trucos de lavado avanzados',
      'Sin anuncios',
    ],
  },
];