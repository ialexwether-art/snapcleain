import { useEffect, useState } from 'react';
import { CircleCheck as CheckCircle, ArrowRight, Loader as Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';

export default function SuccessPage() {
  const { user } = useAuth();
  const { product, loading } = useSubscription(user?.id);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setDots((d) => (d.length < 3 ? d + '.' : '')), 500);
    return () => clearInterval(interval);
  }, [loading]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-6 pt-16">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">
          ¡Suscripción activada!
        </h1>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mt-2 mb-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando tu plan{dots}
          </div>
        ) : product ? (
          <div className="mb-8">
            <p className="text-slate-500 mb-4 leading-relaxed">
              Tu suscripción al{' '}
              <span className="font-semibold text-slate-700">{product.name}</span>{' '}
              está activa. Ya puedes disfrutar de todos sus beneficios.
            </p>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 text-left">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                Tu plan incluye
              </p>
              <ul className="space-y-1.5">
                {product.features.map((f) => (
                  <li key={f} className="text-sm text-slate-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 mb-8 leading-relaxed">
            Tu pago fue procesado correctamente. Tu plan estará activo en breve.
          </p>
        )}

        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
        >
          Ver mis planes
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </main>
  );
}