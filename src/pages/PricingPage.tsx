import { useState } from 'react';
import { Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PricingCard from '@/components/PricingCard';
import AuthModal from '@/components/AuthModal';
import { STRIPE_PRODUCTS } from '@/stripe-config';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createCheckoutSession } from '@/lib/checkout';

export default function PricingPage() {
  const { user, session } = useAuth();
  const { product: currentProduct, isActive } = useSubscription(user?.id);
  const navigate = useNavigate();

  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null);
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const startCheckout = async (priceId: string, activeSession: typeof session) => {
    if (!activeSession) return;
    setLoadingPriceId(priceId);
    setCheckoutError('');
    try {
      const url = await createCheckoutSession(priceId, activeSession);
      window.location.href = url;
    } catch (err: any) {
      setCheckoutError(err.message || 'Error al iniciar el pago.');
      setLoadingPriceId(null);
    }
  };

  const handleSelect = (priceId: string) => {
    if (!user || !session) {
      setPendingPriceId(priceId);
      setShowAuth(true);
      return;
    }
    startCheckout(priceId, session);
  };

  const handleAuthSuccess = () => {
    setShowAuth(false);
    if (pendingPriceId && session) {
      startCheckout(pendingPriceId, session);
      setPendingPriceId(null);
    } else {
      navigate(0); // refresh to get new session
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white pt-28 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" />
            Elige tu plan
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight mb-4">
            Limpia más inteligente,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-blue-600">
              paga menos
            </span>
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
            Escoge el plan que mejor se adapte a tus necesidades. Cancela cuando quieras.
          </p>
        </div>

        {/* Active plan banner */}
        {user && isActive && currentProduct && (
          <div className="mb-8 flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-5 py-3.5 max-w-lg mx-auto">
            <Sparkles className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">
              Tu plan activo: <span className="font-semibold">{currentProduct.name}</span>
            </p>
          </div>
        )}

        {/* Error */}
        {checkoutError && (
          <p className="mb-6 text-center text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 max-w-lg mx-auto">
            {checkoutError}
          </p>
        )}

        {/* Cards */}
        <div className="grid sm:grid-cols-2 gap-6 items-start max-w-2xl mx-auto">
          {STRIPE_PRODUCTS.map((product) => (
            <PricingCard
              key={product.id}
              product={product}
              isCurrentPlan={isActive && currentProduct?.priceId === product.priceId}
              loading={loadingPriceId === product.priceId}
              onSelect={handleSelect}
            />
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-10">
          Pago seguro con Stripe · Sin permanencia · Cancela en cualquier momento
        </p>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />
      )}
    </main>
  );
}