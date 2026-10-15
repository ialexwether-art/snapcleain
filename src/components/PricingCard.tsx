import { Check, Loader as Loader2 } from 'lucide-react';
import { StripeProduct } from '@/stripe-config';

type Props = {
  product: StripeProduct;
  isCurrentPlan?: boolean;
  loading?: boolean;
  onSelect: (priceId: string) => void;
};

export default function PricingCard({ product, isCurrentPlan, loading, onSelect }: Props) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 transition-all duration-200 ${
        product.highlighted
          ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white shadow-2xl shadow-indigo-200 scale-[1.02]'
          : 'bg-white border border-slate-200 text-slate-800 shadow-sm hover:shadow-md'
      }`}
    >
      {product.highlighted && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-sm">
          Más popular
        </span>
      )}

      <div className="mb-6">
        <h3 className={`text-lg font-semibold mb-1 ${product.highlighted ? 'text-white' : 'text-slate-900'}`}>
          {product.shortName}
        </h3>
        <p className={`text-sm leading-relaxed ${product.highlighted ? 'text-indigo-100' : 'text-slate-500'}`}>
          {product.description}
        </p>
      </div>

      <div className="mb-8">
        <span className={`text-5xl font-bold tracking-tight ${product.highlighted ? 'text-white' : 'text-slate-900'}`}>
          {product.currencySymbol}{product.price.toFixed(2)}
        </span>
        <span className={`text-sm ml-1 ${product.highlighted ? 'text-indigo-200' : 'text-slate-400'}`}>/mes</span>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {product.features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${product.highlighted ? 'bg-indigo-500' : 'bg-indigo-50'}`}>
              <Check className={`w-2.5 h-2.5 ${product.highlighted ? 'text-white' : 'text-indigo-600'}`} />
            </span>
            <span className={product.highlighted ? 'text-indigo-50' : 'text-slate-600'}>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => !isCurrentPlan && onSelect(product.priceId)}
        disabled={loading || isCurrentPlan}
        className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${
          product.highlighted
            ? 'bg-white text-indigo-700 hover:bg-indigo-50 shadow-sm'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isCurrentPlan ? (
          'Plan actual'
        ) : (
          'Suscribirme ahora'
        )}
      </button>
    </div>
  );
}