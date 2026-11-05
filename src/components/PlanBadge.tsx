import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';

export function PlanBadge() {
  const { user } = useAuth();
  const { subscription, loading } = useSubscription(user?.id);

  if (!user || loading) return null;

  if (!subscription || subscription.status !== 'active') {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm text-slate-400">
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        Sin plan activo
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500/10 border border-primary-500/30 text-sm text-primary-300">
      <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
      {subscription.product?.name ?? 'Plan Activo'}
    </div>
  );
}