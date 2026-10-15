export type StripeProduct = {
  id: string;
  priceId: string;
  name: string;
  shortName: string;
  description: string;
  features: string[];
  price: number;
  currencySymbol: string;
  currency: string;
  mode: 'subscription' | 'payment';
  highlighted?: boolean;
};

export const STRIPE_PRODUCTS: StripeProduct[] = [
  {
    id: 'prod_VRpR3xYndZBhCi',
    priceId: 'price_1UQvmHLT5EHdVSzq9gWAPTo7',
    name: 'Plan Básico Snapcleain',
    shortName: 'Básico',
    description:
      '5 escaneos semanales, acceso completo al historial guardado de manchas y soporte inteligente con anuncios activos.',
    features: [
      '5 escaneos semanales',
      'Historial completo de manchas',
      'Soporte inteligente',
      'Anuncios activos',
    ],
    price: 3.99,
    currencySymbol: '€',
    currency: 'eur',
    mode: 'subscription',
  },
  {
    id: 'prod_VRpVJJTqjtNMps',
    priceId: 'price_1UQvqwLT5EHdVSzqKZdfoTdC',
    name: 'Plan Premium Snapcleain',
    shortName: 'Premium',
    description:
      'Escaneos de manchas 100% ilimitados, acceso completo al historial, trucos de lavados avanzados y sin anuncios.',
    features: [
      'Escaneos ilimitados',
      'Historial completo',
      'Trucos de lavado avanzados',
      'Sin anuncios',
    ],
    price: 7.99,
    currencySymbol: '€',
    currency: 'eur',
    mode: 'subscription',
    highlighted: true,
  },
];

export function getProductByPriceId(priceId: string): StripeProduct | undefined {
  return STRIPE_PRODUCTS.find((p) => p.priceId === priceId);
}