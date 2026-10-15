import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { analyzeWithGemini } from '@/lib/geminiAnalyzer';
import { STRIPE_PRODUCTS, type StripeProduct } from '@/stripe-config';
import {
  Camera, Sparkles, Scan, BookOpen, Backpack, CreditCard, LogOut,
  Loader, Upload, ChevronRight, X, Check, AlertTriangle, Droplet,
  FlaskRound, Brush, Hand, ShoppingBag, Leaf, Recycle, Wind,
  Coffee, Wine, Shirt, Home as HomeIcon, Car, Search, Crown,
  Zap, Heart, Star, ArrowRight, CircleCheck, Clock, TrendingUp,
  MessageCircle, Send, Plus, RefreshCw, HelpCircle,
  Smartphone, Monitor, Menu,
} from 'lucide-react';

/* ============================================================
   TYPES
   ============================================================ */

type User = {
  email: string;
  provider: 'google' | 'apple';
};

type View = 'home' | 'scanner' | 'library' | 'kit' | 'pricing';

type ScanResult = {
  stainType: string;
  surface: string;
  product: string;
  steps: { emoji: string; text: string }[];
  warning: string;
  imageUrl: string;
  date: string;
  followUp?: { question: string; answer: string }[];
};

type LibraryProduct = {
  name: string;
  image: string;
  category: string;
  description: string;
};

/* ============================================================
   DATA — Cleaning product library
   ============================================================ */

const PRODUCTS: LibraryProduct[] = [
  { name: 'Vinagre blanco', image: '/vinagre.webp', category: 'Natural', description: 'Desengrasante y desodorizante natural. Ideal para cristales, suelos y desinfección general.' },
  { name: 'Bicarbonato de sodio', image: '/bicarbonato.webp', category: 'Natural', description: 'Abrillantador y eliminador de olores. Excelente para superficies rugosas y manchas persistentes.' },
  { name: 'Limón natural', image: '/limon-natural.webp', category: 'Natural', description: 'Antibacteriano y blanqueador natural. Perfecto para manchas orgánicas y óxido.' },
  { name: 'Aceite esencial de limón', image: '/aceite-esencial-limon.webp', category: 'Natural', description: 'Desengrasante concentrado. Unas gotas potencian cualquier mezcla de limpieza.' },
  { name: 'Jabón de Castilla', image: '/jabon-castilla.webp', category: 'Natural', description: 'Jabón vegetal multiusos, suave con tejidos delicados y superficies sensibles.' },
  { name: 'Escamas de jabón', image: '/escamas-jabon.webp', category: 'Natural', description: 'Base para detergente casero. Disuelve en agua caliente para limpieza profunda.' },
  { name: 'Sal gorda', image: '/sal-grosa.webp', category: 'Natural', description: 'Abrupta para manchas frescas. Absorbe líquidos y actúa como exfoliante.' },
  { name: 'Alcohol', image: '/alcohol.webp', category: 'Químico', description: 'Evaporante rápido para desinfección y manchas de tinta o adhesivos.' },
  { name: 'Acetona', image: '/acetona.webp', category: 'Químico', description: 'Disolvente fuerte para manchas de esmalte, pintura o pegamento. No usar en tejidos sintéticos.' },
  { name: 'Agua oxigenada', image: '/agua-oxigenada.webp', category: 'Químico', description: 'Blanqueador suave para manchas de sangre, vino o café en tejidos blancos.' },
  { name: 'Detergente líquido', image: '/detergente-liquido.webp', category: 'Químico', description: 'Agente surfactante general. Base para pretratamiento de manchas en ropa.' },
  { name: 'Jabón de platos', image: '/jabon-platos.webp', category: 'Químico', description: 'Desengrasante suave. Ideal para manchas de grasa alimentaria en tejidos.' },
  { name: 'Fairy Ultra', image: '/fairy-ultra.webp', category: 'Químico', description: 'Concentrado desengrasante. Unas gotas disuelven grasa incrustada en cualquier superficie.' },
  { name: 'KH-7 Professional', image: '/kh-7-professional.webp', category: 'Químico', description: 'Quitagrasas profesional para cocinas y baños. Potente sobre grasa quemada.' },
  { name: 'Dr. Beckmann Mago', image: '/dr-beckmann-mago.webp', category: 'Quitamanchas', description: 'Eliminador de manchas específico para ropa. Actúa sobre manchas mixtas.' },
  { name: 'Vanish Oxi Action', image: '/vanish-oxi-action.webp', category: 'Quitamanchas', description: 'Oxigenante para blancos y color. Potente sobre manchas orgánicas.' },
  { name: 'The Pink Stuff', image: '/the-pink-stuff.webp', category: 'Quitamanchas', description: 'Pasta limpiadora abrasiva suave. Para manchas incrustadas en superficies duras.' },
  { name: 'Quitamanchas genérico', image: '/quitamanchas.webp', category: 'Quitamanchas', description: 'Pretratamiento en spray para ropa. Aplicar antes del lavado.' },
  { name: 'Limpiador multiusos ecológico', image: '/limpiador-eco-multi.webp', category: 'Químico', description: 'Fórmula vegetal para limpieza diaria de toda la casa.' },
  { name: 'Limpiador de madera', image: '/limpiador-madera.webp', category: 'Químico', description: 'Nutre y limpia maderas sin dañar el barniz. Devuelve el brillo natural.' },
  { name: 'Cepillo de cerdas', image: '/cepillo.webp', category: 'Herramienta', description: 'Cepillo de cerdas suaves para trabajar el producto sobre la mancha sin dañar.' },
  { name: 'Paños de microfibra', image: '/panos-microfibra.webp', category: 'Herramienta', description: 'Absorbentes y no rayan. Esenciales para secar y pulir tras la limpieza.' },
  { name: 'Guantes de goma', image: '/guantes.webp', category: 'Herramienta', description: 'Protección para manos durante el uso de productos químicos.' },
];

const KIT_ESSENTIALS = [
  { name: 'Vinagre blanco', image: '/vinagre.webp' },
  { name: 'Bicarbonato', image: '/bicarbonato.webp' },
  { name: 'Jabón de platos', image: '/jabon-platos.webp' },
  { name: 'Agua oxigenada', image: '/agua-oxigenada.webp' },
  { name: 'Cepillo', image: '/cepillo.webp' },
  { name: 'Paños microfibra', image: '/panos-microfibra.webp' },
  { name: 'Alcohol', image: '/alcohol.webp' },
  { name: 'Guantes', image: '/guantes.webp' },
];

const CATEGORIES = ['Todos', 'Natural', 'Químico', 'Quitamanchas', 'Herramienta'];

/* ============================================================
   AUTH
   ============================================================ */

function useGoogleAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('snapcleain_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch { /* ignore */ }
    }
    setLoading(false);

    const g = (window as any).google;
    if (g) {
      g.accounts.id.initialize({
        client_id: 'YOUR_GOOGLE_CLIENT_ID',
        callback: async (response: any) => {
          const payload = JSON.parse(atob(response.credential.split('.')[1]));
          const u: User = { email: payload.email, provider: 'google' };
          localStorage.setItem('snapcleain_user', JSON.stringify(u));
          setUser(u);
          await ensureProfile(u);
        },
      });
    }
  }, []);

  const ensureProfile = async (u: User) => {
    await supabase.from('profiles').upsert({
      email: u.email,
      provider: u.provider,
    }, { onConflict: 'email' });
  };

  const signIn = (u: User) => {
    localStorage.setItem('snapcleain_user', JSON.stringify(u));
    setUser(u);
    ensureProfile(u);
  };

  const signOut = () => {
    localStorage.removeItem('snapcleain_user');
    setUser(null);
  };

  return { user, loading, signIn, signOut };
}

/* ============================================================
   TOKEN HOOK
   ============================================================ */

const FREE_SCAN_LIMIT = 2;

function useTokens(user: User | null) {
  const [tokens, setTokens] = useState<number>(FREE_SCAN_LIMIT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      const used = parseInt(localStorage.getItem('snapcleain_free_scans') || '0', 10);
      setTokens(Math.max(FREE_SCAN_LIMIT - used, 0));
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchTokens() {
      const { data } = await supabase
        .from('profiles')
        .select('token_balance')
        .eq('email', user!.email)
        .maybeSingle();

      if (!cancelled) {
        setTokens(data?.token_balance ?? 3);
        setLoading(false);
      }
    }

    fetchTokens();
  }, [user]);

  const consumeToken = useCallback(async (): Promise<boolean> => {
    if (!user) {
      const used = parseInt(localStorage.getItem('snapcleain_free_scans') || '0', 10);
      const remaining = Math.max(FREE_SCAN_LIMIT - used, 0);
      if (remaining <= 0) return false;
      localStorage.setItem('snapcleain_free_scans', String(used + 1));
      setTokens(remaining - 1);
      return true;
    }

    if (tokens <= 0) return false;

    const newBalance = tokens - 1;
    const { error } = await supabase
      .from('profiles')
      .update({ token_balance: newBalance })
      .eq('email', user.email);

    if (!error) setTokens(newBalance);
    return !error;
  }, [user, tokens]);

  return { tokens, loading, consumeToken };
}

/* ============================================================
   STRIPE CHECKOUT
   ============================================================ */

async function startStripeCheckout(
  product: StripeProduct,
  userEmail: string,
): Promise<string> {
  const origin = window.location.origin;

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        price_id: product.priceId,
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/`,
        mode: product.mode,
        email: userEmail,
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo iniciar el proceso de pago.');
  }

  const data = await response.json();
  return data.url as string;
}

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const { user, signOut } = useGoogleAuth();
  const { tokens, consumeToken } = useTokens(user);
  const [view, setView] = useState<View>('home');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [checkoutMsg, setCheckoutMsg] = useState('');
  const [mobileMode, setMobileMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('snapcleain_history');
    if (saved) {
      try { setScanHistory(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (checkoutMsg) {
      const t = setTimeout(() => setCheckoutMsg(''), 4000);
      return () => clearTimeout(t);
    }
  }, [checkoutMsg]);

  const handleScan = useCallback((result: ScanResult) => {
    const updated = [result, ...scanHistory].slice(0, 20);
    setScanHistory(updated);
    localStorage.setItem('snapcleain_history', JSON.stringify(updated));
  }, [scanHistory]);

  const handleStartScan = useCallback(() => {
    setView('scanner');
  }, []);

  const [scanBlocked, setScanBlocked] = useState(false);

  const handleScanAttempt = useCallback(async () => {
    if (!user && !subscriptionActive) {
      const used = parseInt(localStorage.getItem('snapcleain_free_scans') || '0', 10);
      if (used >= FREE_SCAN_LIMIT) {
        setScanBlocked(true);
        return;
      }
    }
    setView('scanner');
  }, [user, subscriptionActive]);

  const handlePricingSelect = async (product: StripeProduct) => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const url = await startStripeCheckout(product, user.email);
      window.location.href = url;
    } catch (err: any) {
      setCheckoutMsg(err.message || 'Error al iniciar el pago.');
    }
  };

  return (
    <div className={mobileMode ? 'min-h-screen bg-gray-300 flex justify-center' : 'min-h-screen bg-ink-50'}>
      <div className={mobileMode ? 'w-full max-w-[430px] bg-ink-50 min-h-screen shadow-2xl overflow-x-hidden [transform:translateZ(0)]' : 'w-full'}>
        <Header
          user={user}
          view={view}
          setView={setView}
          tokens={tokens}
          subscriptionActive={subscriptionActive}
          onSignOut={signOut}
          onSignIn={() => setShowAuthModal(true)}
          mobileMode={mobileMode}
        />

        <main className={mobileMode ? 'pb-6' : 'pb-16 md:pb-0'}>
          {view === 'home' && (
            <HomeView
              user={user}
              tokens={tokens}
              onScan={handleScanAttempt}
              setView={setView}
            />
          )}
          {view === 'scanner' && (
            <ScannerView
              user={user}
              tokens={tokens}
              consumeToken={consumeToken}
              onScanComplete={handleScan}
              subscriptionActive={subscriptionActive}
            />
          )}
          {view === 'library' && <LibraryView setView={setView} />}
          {view === 'kit' && <KitView setView={setView} />}
          {view === 'pricing' && (
            <PricingView
              user={user}
              subscriptionActive={subscriptionActive}
              onSelect={handlePricingSelect}
              checkoutMsg={checkoutMsg}
            />
          )}
        </main>

        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
          />
        )}

        {scanBlocked && !showAuthModal && (
          <ScanLimitModal
            onClose={() => setScanBlocked(false)}
            onLogin={() => { setScanBlocked(false); setShowAuthModal(true); }}
          />
        )}

        <Footer />
      </div>

      <button
        onClick={() => setMobileMode(!mobileMode)}
        className="fixed bottom-6 right-6 z-[100] w-12 h-12 rounded-full bg-ink-900 text-white shadow-2xl hover:bg-ink-800 flex items-center justify-center transition-all hover:scale-110"
        title={mobileMode ? 'Ver en escritorio' : 'Ver en móvil'}
      >
        {mobileMode ? <Monitor className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
      </button>
    </div>
  );
}

/* ============================================================
   HEADER
   ============================================================ */

function Header({
  user, view, setView, tokens, subscriptionActive, onSignOut, onSignIn, mobileMode,
}: {
  user: User | null;
  view: View;
  setView: (v: View) => void;
  tokens: number;
  subscriptionActive: boolean;
  onSignOut: () => void;
  onSignIn: () => void;
  mobileMode: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems: { id: View; label: string; icon: any }[] = [
    { id: 'home', label: 'Inicio', icon: HomeIcon },
    { id: 'scanner', label: 'Escáner', icon: Scan },
    { id: 'library', label: 'Biblioteca', icon: BookOpen },
    { id: 'kit', label: 'Botiquín', icon: Backpack },
    { id: 'pricing', label: 'Planes', icon: CreditCard },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-ink-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex items-center group">
            <img src="/logo_snapcleAIn_positivo.png" alt="snapcleAIn" className="h-12 w-auto group-hover:scale-105 transition-transform" />
          </button>

          <nav className={`${mobileMode ? 'hidden' : 'hidden md:flex'} items-center gap-1`}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  view === item.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user && !subscriptionActive && (
              <div className={`${mobileMode ? 'flex' : 'hidden sm:flex'} items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-50 border border-accent-200`}>
                <Zap className="w-3.5 h-3.5 text-accent-600" />
                <span className="text-sm font-semibold text-accent-700">{tokens}</span>
                <span className="text-xs text-accent-600">tokens</span>
              </div>
            )}
            {user && subscriptionActive && (
              <div className={`${mobileMode ? 'flex' : 'hidden sm:flex'} items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200`}>
                <Crown className="w-3.5 h-3.5 text-brand-600" />
                <span className="text-sm font-semibold text-brand-700">Premium</span>
              </div>
            )}
            {user ? (
              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900 transition-colors px-3 py-2 rounded-lg hover:bg-ink-100"
              >
                <LogOut className="w-4 h-4" />
                <span className={`${mobileMode ? 'hidden' : 'hidden sm:block'}`}>Salir</span>
              </button>
            ) : (
              <button
                onClick={onSignIn}
                className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors px-4 py-2 rounded-lg shadow-sm whitespace-nowrap"
              >
                Iniciar sesión
              </button>
            )}
            {mobileMode && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-700 hover:bg-ink-100 transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hamburger menu for mobile mode */}
      {mobileMode && menuOpen && (
        <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" />
          <div
            className="absolute top-0 right-0 w-64 h-full bg-white shadow-2xl p-6 animate-slide-down"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold text-ink-900">Menú</span>
              <button onClick={() => setMenuOpen(false)} className="text-ink-400 hover:text-ink-600 p-1 rounded-lg hover:bg-ink-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setView(item.id); setMenuOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    view === item.id
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Bottom nav for real mobile (not mobileMode) */}
      <nav className={`${mobileMode ? 'hidden' : 'flex md:hidden'} fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-ink-200/60 px-2 h-14 items-center justify-around`}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
              view === item.id ? 'text-brand-600' : 'text-ink-400'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

/* ============================================================
   HOME VIEW
   ============================================================ */

function HomeView({
  user, tokens, onScan, setView,
}: {
  user: User | null;
  tokens: number;
  onScan: () => void;
  setView: (v: View) => void;
}) {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden hero-grid-bg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-24 md:pt-20 md:pb-32">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 animate-fade-in">
              <Sparkles className="w-3.5 h-3.5" />
              IA experta en manchas, disponible 24/7
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-ink-900 tracking-tight leading-[1.1] mb-6 animate-fade-in-up">
              Fotografía la mancha.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-brand-700">
                Recibe la solución al instante.
              </span>
            </h1>
            <p className="text-lg text-ink-500 max-w-xl mx-auto leading-relaxed mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              snapcleAIn analiza tu foto con inteligencia artificial y te dice exactamente qué producto usar y cómo limpiar la mancha paso a paso.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <button
                onClick={onScan}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-2xl text-base transition-all shadow-lg shadow-brand-200 hover:shadow-xl hover:shadow-brand-300 hover:scale-[1.02]"
              >
                <Camera className="w-5 h-5" />
                Escanea tu mancha
              </button>
              <button
                onClick={() => setView('library')}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-white border border-ink-200 hover:border-brand-300 text-ink-700 font-semibold rounded-2xl text-base transition-all hover:bg-brand-50"
              >
                <BookOpen className="w-5 h-5" />
                Ver biblioteca
              </button>
            </div>
            {user && (
              <div className="mt-8 inline-flex items-center gap-2 text-sm text-ink-500 animate-fade-in">
                <Check className="w-4 h-4 text-brand-500" />
                Has iniciado sesión con <span className="font-semibold text-ink-700">{user.email}</span>
                {!tokens ? null : <span className="text-ink-400">· {tokens} escaneos disponibles</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-ink-900 tracking-tight mb-3">Cómo funciona</h2>
          <p className="text-ink-500 max-w-lg mx-auto">Tres pasos. Menos de 30 segundos.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Camera, title: '1. Fotografía', desc: 'Haz una foto clara de la mancha con tu móvil. Sin preparar nada especial.', color: 'brand' },
            { icon: Sparkles, title: '2. Analiza', desc: 'La IA identifica la mancha, la superficie y el mejor producto para eliminarla.', color: 'accent' },
            { icon: CircleCheck, title: '3. Limpia', desc: 'Sigue los pasos detallados con emojis y advertencias. Mancha eliminada.', color: 'success' },
          ].map((step, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-8 border border-ink-200/60 shadow-sm hover:shadow-md transition-all hover:scale-[1.02] animate-fade-in-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className={`w-14 h-14 rounded-2xl bg-${step.color}-50 flex items-center justify-center mb-5`}>
                <step.icon className={`w-7 h-7 text-${step.color}-600`} />
              </div>
              <h3 className="text-lg font-semibold text-ink-900 mb-2">{step.title}</h3>
              <p className="text-sm text-ink-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-white border-y border-ink-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-ink-900 tracking-tight mb-3">Por qué snapcleAIn</h2>
            <p className="text-ink-500 max-w-lg mx-auto">El limpiador inteligente que cabe en tu bolsillo.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Scan, title: 'IA visual', desc: 'Gemini 3.6 analiza tu foto y reconoce el tipo de mancha y la superficie.' },
              { icon: BookOpen, title: 'Biblioteca completa', desc: 'Más de 20 productos catalogados: naturales, químicos y herramientas.' },
              { icon: AlertTriangle, title: 'Advertencias críticas', desc: 'Te avisa de qué no hacer para no dañar tus tejidos o superficies.' },
              { icon: Recycle, title: 'Soluciones eco', desc: 'Prioriza productos naturales y caseros antes de recurrir a químicos.' },
            ].map((f, i) => (
              <div key={i} className="text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
                  <f.icon className="w-6 h-6 text-brand-600" />
                </div>
                <h3 className="font-semibold text-ink-900 mb-2">{f.title}</h3>
                <p className="text-sm text-ink-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-10 md:p-16 text-center">
          <div className="absolute inset-0 hero-grid-bg opacity-20" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
              Tu próxima mancha, resuelta en segundos
            </h2>
            <p className="text-brand-100 text-lg max-w-xl mx-auto mb-8">
              Prueba snapcleAIn gratis. Escanea sin registrarte y sin límites.
            </p>
            <button
              onClick={onScan}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-700 font-semibold rounded-2xl text-base transition-all shadow-lg hover:scale-[1.02] hover:shadow-xl"
            >
              <Camera className="w-5 h-5" />
              Empezar a escanear
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   SCANNER VIEW
   ============================================================ */

function ScannerView({
  user, tokens, consumeToken, onScanComplete, subscriptionActive,
}: {
  user: User | null;
  tokens: number;
  consumeToken: () => Promise<boolean>;
  onScanComplete: (r: ScanResult) => void;
  subscriptionActive: boolean;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [userNote, setUserNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setAnalyzing(true);
    setError('');

    if (!subscriptionActive) {
      const ok = await consumeToken();
      if (!ok) {
 if (!user) {
          setError('Has usado tus 2 escaneos gratis. Inicia sesión para seguir escaneando.');
 } else {
          setError('No te quedan escaneos. Suscríbete a un plan para escaneos ilimitados.');
 }
        setAnalyzing(false);
        return;
      }
    }

    try {
      const raw = await analyzeWithGemini(selectedFile, userNote);
      const parsed = parseGeminiResponse(raw, previewUrl);
      setResult(parsed);
      onScanComplete(parsed);
    } catch (err: any) {
      setError(err.message || 'No se pudo analizar la imagen. Inténtalo de nuevo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setUserNote('');
    setResult(null);
    setError('');
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ink-900 tracking-tight mb-2">Escáner de manchas</h1>
          <p className="text-ink-500">Sube una foto y recibe tu solución personalizada</p>
        </div>

        {!subscriptionActive && (
          <div className="mb-6 flex items-center justify-center gap-2 text-sm">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${tokens > 0 ? 'bg-accent-50 border border-accent-200 text-accent-700' : 'bg-error-500/10 border border-error-500/30 text-error-600'}`}>
              <Zap className="w-3.5 h-3.5" />
              <span className="font-semibold">{tokens}</span>
              <span className="text-xs">{user ? 'escaneos restantes' : 'escaneos gratis restantes'}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-error-500/10 border border-error-500/30 rounded-xl px-4 py-3 animate-slide-down">
            <AlertTriangle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-error-600 font-medium">{error}</p>
            </div>
          </div>
        )}

        {!selectedFile && !result && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-ink-300 rounded-3xl p-12 text-center bg-white hover:border-brand-400 hover:bg-brand-50/30 transition-all cursor-pointer animate-fade-in"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-5 animate-pulse-ring">
              <Upload className="w-10 h-10 text-brand-500" />
            </div>
            <h3 className="text-lg font-semibold text-ink-900 mb-2">Sube la foto de tu mancha</h3>
            <p className="text-sm text-ink-500 mb-4">Arrastra una imagen o haz clic para seleccionar</p>
            <p className="text-xs text-ink-400">JPG, PNG, WEBP · Máx 10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {selectedFile && !result && (
          <div className="bg-white rounded-3xl p-6 border border-ink-200/60 shadow-sm animate-zoom-in">
            <div className="relative rounded-2xl overflow-hidden mb-5">
              <img src={previewUrl} alt="Mancha" className="w-full max-h-80 object-contain bg-ink-100" />
              <button
                onClick={reset}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-ink-700 mb-2">
                ¿Alguna pista? <span className="text-ink-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="Ej: es una camiseta de algodón, la mancha es de vino tinto de hace dos días..."
                className="w-full px-4 py-3 rounded-xl border border-ink-200 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-none"
                rows={3}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {analyzing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Analizando tu mancha...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Analizar con IA
                </>
              )}
            </button>
          </div>
        )}

        {result && (
          <ScanResultCard result={result} onReset={reset} selectedFile={selectedFile} />
        )}
      </div>
    </div>
  );
}

function ScanResultCard({ result, onReset, selectedFile }: { result: ScanResult; onReset: () => void; selectedFile: File | null }) {
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpList, setFollowUpList] = useState<{ question: string; answer: string }[]>(result.followUp ?? []);
  const [followUpError, setFollowUpError] = useState('');

  const handleAsk = async () => {
    if (!followUpQuestion.trim() || !selectedFile) return;
    setFollowUpLoading(true);
    setFollowUpError('');
    try {
      const answer = await askFollowUp(selectedFile, result, followUpQuestion.trim());
      const entry = { question: followUpQuestion.trim(), answer };
      setFollowUpList((prev) => [...prev, entry]);
      setFollowUpQuestion('');
      setShowFollowUp(false);
    } catch (err: any) {
      setFollowUpError(err.message || 'No se pudo procesar tu pregunta.');
    } finally {
      setFollowUpLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Image + identification */}
      <div className="bg-white rounded-3xl overflow-hidden border border-ink-200/60 shadow-sm">
        <img src={result.imageUrl} alt="Mancha analizada" className="w-full max-h-72 object-cover" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
              <Scan className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-ink-900">{result.stainType}</h2>
              <p className="text-sm text-ink-500">{result.surface}</p>
            </div>
          </div>
          <div className="bg-brand-50 rounded-xl px-4 py-3 flex items-start gap-2">
            <Droplet className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-brand-800">
              <span className="font-semibold">Producto:</span> {result.product}
            </p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-ink-200/60 shadow-sm">
        <h3 className="font-semibold text-ink-900 mb-4 flex items-center gap-2">
          <Brush className="w-5 h-5 text-brand-600" />
          Paso a paso
        </h3>
        <div className="space-y-3">
          {result.steps.map((step, i) => (
            <div key={i} className="flex gap-3 p-3 sm:p-4 rounded-xl bg-ink-50 border border-ink-200/50">
              <div className="text-xl sm:text-2xl flex-shrink-0">{step.emoji}</div>
              <div className="flex-1">
                <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">Paso {i + 1}</span>
                <p className="text-sm text-ink-700 leading-relaxed mt-0.5">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="bg-error-500/5 border border-error-500/20 rounded-3xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-error-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-error-600" />
          </div>
          <div>
            <h3 className="font-semibold text-error-600 mb-1">Advertencia crítica</h3>
            <p className="text-sm text-error-600/80 leading-relaxed">{result.warning}</p>
          </div>
        </div>
      </div>

      {/* Follow-up Q&A history */}
      {followUpList.length > 0 && (
        <div className="space-y-3">
          {followUpList.map((qa, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 sm:p-5 border border-brand-200/40 shadow-sm animate-slide-down">
              <div className="flex items-start gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-3.5 h-3.5 text-brand-600" />
                </div>
                <p className="text-sm font-medium text-ink-900">{qa.question}</p>
              </div>
              <div className="pl-8">
                <p className="text-sm text-ink-600 leading-relaxed">{qa.answer}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Follow-up error */}
      {followUpError && (
        <div className="flex items-start gap-3 bg-error-500/10 border border-error-500/30 rounded-xl px-4 py-3 animate-slide-down">
          <AlertTriangle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-600">{followUpError}</p>
        </div>
      )}

      {/* Follow-up question input */}
      {showFollowUp ? (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-ink-200/60 shadow-sm animate-zoom-in">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="w-5 h-5 text-brand-600" />
            <h3 className="font-semibold text-ink-900">Haz una pregunta</h3>
          </div>
          <textarea
            value={followUpQuestion}
            onChange={(e) => setFollowUpQuestion(e.target.value)}
            placeholder="Ej: ¿Puedo usar este producto en seda? ¿Cuánto tiempo dejo actuar?"
            className="w-full px-4 py-3 rounded-xl border border-ink-200 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm resize-none mb-3"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowFollowUp(false); setFollowUpError(''); }}
              className="flex-1 py-3 rounded-xl border border-ink-200 text-ink-600 font-medium text-sm hover:bg-ink-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAsk}
              disabled={followUpLoading || !followUpQuestion.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {followUpLoading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Preguntar
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowFollowUp(true)}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-brand-50 border border-brand-200 hover:bg-brand-100 text-brand-700 font-semibold rounded-xl transition-all"
        >
          <Plus className="w-5 h-5" />
          Preguntar otra cosa
        </button>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => shareOnWhatsApp(result)}
          className="flex items-center justify-center gap-2 px-4 py-3.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white font-semibold rounded-xl transition-all shadow-sm"
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp
        </button>
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-ink-200 hover:border-brand-300 text-ink-700 font-semibold rounded-xl transition-all"
        >
          <Camera className="w-5 h-5" />
          Otra mancha
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   LIBRARY VIEW
   ============================================================ */

function LibraryView({ setView }: { setView: (v: View) => void }) {
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');

  const filtered = PRODUCTS.filter((p) => {
    const matchCat = category === 'Todos' || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const categoryIcons: Record<string, any> = {
    'Natural': Leaf,
    'Químico': FlaskRound,
    'Quitamanchas': Droplet,
    'Herramienta': Hand,
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ink-900 tracking-tight mb-2">Biblioteca de productos</h1>
          <p className="text-ink-500">Todo lo que necesitas para eliminar cualquier mancha</p>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-ink-200 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Categories */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          {CATEGORIES.map((cat) => {
            const Icon = categoryIcons[cat] || BookOpen;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  category === cat
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white border border-ink-200 text-ink-600 hover:border-brand-300 hover:text-brand-600'
                }`}
              >
                {cat !== 'Todos' && <Icon className="w-3.5 h-3.5" />}
                {cat}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((product, i) => (
            <div
              key={product.name}
              className="group bg-white rounded-2xl overflow-hidden border border-ink-200/60 shadow-sm hover:shadow-md transition-all hover:scale-[1.03] animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}
            >
              <div className="aspect-square bg-ink-100 overflow-hidden">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  {product.category === 'Natural' && <Leaf className="w-3 h-3 text-brand-500" />}
                  {product.category === 'Químico' && <FlaskRound className="w-3 h-3 text-accent-500" />}
                  {product.category === 'Quitamanchas' && <Droplet className="w-3 h-3 text-brand-600" />}
                  {product.category === 'Herramienta' && <Hand className="w-3 h-3 text-ink-500" />}
                  <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{product.category}</span>
                </div>
                <h3 className="font-semibold text-sm text-ink-900 mb-1 leading-tight">{product.name}</h3>
                <p className="text-xs text-ink-500 leading-relaxed line-clamp-2">{product.description}</p>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-ink-400">No se encontraron productos.</p>
          </div>
        )}

        {/* Kit CTA */}
        <div className="mt-12 bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl p-8 text-center">
          <Backpack className="w-10 h-10 text-white mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">¿Tu botiquín de limpieza?</h2>
          <p className="text-brand-100 text-sm mb-5 max-w-md mx-auto">Descubre los 8 productos imprescindibles para resolver el 90% de las manchas del hogar.</p>
          <button
            onClick={() => setView('kit')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-700 font-semibold rounded-xl text-sm transition-all hover:scale-105 shadow-lg"
          >
            Ver botiquín esencial
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   KIT VIEW
   ============================================================ */

function KitView({ setView }: { setView: (v: View) => void }) {
  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ink-900 tracking-tight mb-2">Tu botiquín de limpieza</h1>
          <p className="text-ink-500">Los 8 imprescindibles para resolver el 90% de las manchas</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-ink-200/60 shadow-sm mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Backpack className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-ink-900">Botiquín esencial</h2>
              <p className="text-xs text-ink-500">Recomendado por snapcleAIn</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {KIT_ESSENTIALS.map((item, i) => (
              <div
                key={item.name}
                className="text-center animate-fade-in-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className="aspect-square rounded-2xl bg-ink-100 overflow-hidden mb-2 group">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
                <p className="text-xs font-medium text-ink-700">{item.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: Leaf, title: 'Empieza por lo natural', desc: 'Vinagre, bicarbonato y limón resuelven muchas manchas sin productos agresivos.' },
            { icon: AlertTriangle, title: 'Prueba antes en zona oculta', desc: 'Aplica el producto en una esquina discreta para comprobar que no daña el material.' },
            { icon: Droplet, title: 'Menos es más', desc: 'Usa la cantidad mínima necesaria. El exceso de producto puede dejar residuos.' },
            { icon: Wind, title: 'Ventila siempre', desc: 'Al usar productos químicos, asegúrate de tener buena ventilación en la zona.' },
          ].map((tip, i) => (
            <div
              key={i}
              className="flex gap-3 p-5 bg-white rounded-2xl border border-ink-200/60 shadow-sm animate-fade-in-up"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <tip.icon className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-ink-900 mb-1">{tip.title}</h3>
                <p className="text-xs text-ink-500 leading-relaxed">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Library CTA */}
        <div className="mt-8 bg-white rounded-3xl p-8 border border-ink-200/60 shadow-sm text-center">
          <BookOpen className="w-10 h-10 text-brand-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-ink-900 mb-2">Explora la biblioteca completa</h2>
          <p className="text-ink-500 text-sm mb-5 max-w-md mx-auto">Más de 20 productos catalogados: naturales, químicos, quitamanchas y herramientas.</p>
          <button
            onClick={() => setView('library')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-all hover:scale-105 shadow-lg"
          >
            Ver biblioteca
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PRICING VIEW
   ============================================================ */

function PricingView({
  user, subscriptionActive, onSelect, checkoutMsg,
}: {
  user: User | null;
  subscriptionActive: boolean;
  onSelect: (p: StripeProduct) => void;
  checkoutMsg: string;
}) {
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  const handleSelect = async (product: StripeProduct) => {
    setLoadingPriceId(product.priceId);
    await onSelect(product);
    setLoadingPriceId(null);
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" />
            Elige tu plan
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-ink-900 tracking-tight mb-4">
            Limpia más inteligente,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-brand-700">
              paga menos
            </span>
          </h1>
          <p className="text-lg text-ink-500 max-w-xl mx-auto leading-relaxed">
            Escoge el plan que mejor se adapte a ti. Cancela cuando quieras.
          </p>
        </div>

        {checkoutMsg && (
          <div className="mb-6 flex items-center gap-3 bg-error-500/10 border border-error-500/30 rounded-xl px-4 py-3 max-w-lg mx-auto animate-slide-down">
            <AlertTriangle className="w-5 h-5 text-error-600 flex-shrink-0" />
            <p className="text-sm text-error-600">{checkoutMsg}</p>
          </div>
        )}

        {subscriptionActive && (
          <div className="mb-8 flex items-center gap-3 bg-success-500/10 border border-success-500/30 rounded-xl px-5 py-3.5 max-w-lg mx-auto">
            <Crown className="w-5 h-5 text-success-600 flex-shrink-0" />
            <p className="text-sm text-success-600">
              Tu plan Premium está activo. Disfrutas de escaneos ilimitados.
            </p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6 items-start max-w-2xl mx-auto">
          {STRIPE_PRODUCTS.map((product) => (
            <PricingCardView
              key={product.id}
              product={product}
              loading={loadingPriceId === product.priceId}
              onSelect={handleSelect}
              disabled={!user}
            />
          ))}
        </div>

        <p className="text-center text-xs text-ink-400 mt-10">
          Pago seguro con Stripe · Sin permanencia · Cancela en cualquier momento
        </p>
      </div>
    </div>
  );
}

function PricingCardView({
  product, loading, onSelect, disabled,
}: {
  product: StripeProduct;
  loading: boolean;
  onSelect: (p: StripeProduct) => void;
  disabled: boolean;
}) {
  const highlighted = product.highlighted;

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 transition-all duration-200 ${
        highlighted
          ? 'bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-2xl shadow-brand-200 scale-[1.02]'
          : 'bg-white border border-ink-200 text-ink-800 shadow-sm hover:shadow-md'
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-accent-300 to-accent-500 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-sm">
          Más popular
        </span>
      )}

      <div className="mb-6">
        <h3 className={`text-lg font-semibold mb-1 ${highlighted ? 'text-white' : 'text-ink-900'}`}>
          {product.shortName}
        </h3>
        <p className={`text-sm leading-relaxed ${highlighted ? 'text-brand-100' : 'text-ink-500'}`}>
          {product.description}
        </p>
      </div>

      <div className="mb-8">
        <span className={`text-5xl font-bold tracking-tight ${highlighted ? 'text-white' : 'text-ink-900'}`}>
          {product.currencySymbol}{product.price.toFixed(2)}
        </span>
        <span className={`text-sm ml-1 ${highlighted ? 'text-brand-200' : 'text-ink-400'}`}>/mes</span>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {product.features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${highlighted ? 'bg-brand-500' : 'bg-brand-50'}`}>
              <Check className={`w-2.5 h-2.5 ${highlighted ? 'text-white' : 'text-brand-600'}`} />
            </span>
            <span className={highlighted ? 'text-brand-50' : 'text-ink-600'}>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(product)}
        disabled={loading || disabled}
        className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${
          highlighted
            ? 'bg-white text-brand-700 hover:bg-brand-50 shadow-sm'
            : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
        }`}
      >
        {loading ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : disabled ? (
          'Inicia sesión para suscribirte'
        ) : (
          'Suscribirme ahora'
        )}
      </button>
    </div>
  );
}

/* ============================================================
   AUTH MODAL
   ============================================================ */

function AuthModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleGoogle = () => {
    setLoading(true);
    const googleBtn = document.getElementById('google-signin-btn');
    if (googleBtn) googleBtn.click();
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-400 hover:text-ink-600 transition-colors p-1 rounded-lg hover:bg-ink-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-ink-900 mb-1">Bienvenido a snapcleAIn</h2>
          <p className="text-sm text-ink-500">Inicia sesión para empezar a escanear manchas</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-ink-200 rounded-xl text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors disabled:opacity-60"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <button
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-ink-200 rounded-xl text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors disabled:opacity-60"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 12.04c-.03-2.93 2.39-4.34 2.5-4.41-1.36-1.99-3.48-2.26-4.24-2.29-1.81-.18-3.53 1.06-4.45 1.06-.92 0-2.33-1.03-3.83-1-1.97.03-3.79 1.15-4.81 2.91-2.05 3.56-.52 8.83 1.47 11.72.97 1.41 2.13 3 3.63 2.94 1.45-.06 2-.94 3.76-.94 1.75 0 2.25.94 3.79.91 1.57-.03 2.56-1.44 3.52-2.85 1.11-1.63 1.57-3.21 1.6-3.29-.04-.02-3.07-1.18-3.1-4.67zM14.27 3.7c.81-.98 1.35-2.34 1.2-3.7-1.16.05-2.57.78-3.41 1.75-.75.87-1.41 2.26-1.24 3.59 1.3.1 2.63-.66 3.45-1.64z"/>
            </svg>
            Continuar con Apple
          </button>
        </div>

        <div id="google-signin-btn" className="hidden" />

        <p className="text-center text-xs text-ink-400 mt-6">
          Al continuar, aceptas nuestros términos y nuestra política de privacidad.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   FOOTER
   ============================================================ */

function Footer() {
  return (
    <footer className="bg-white border-t border-ink-200/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <img src="/logo_snapcleAIn_positivo.png" alt="snapcleAIn" className="h-10 w-auto" />
          </div>
          <p className="text-sm text-ink-400">
            IA experta en manchas · Hecho con Gemini 3.6
          </p>
          <div className="flex items-center gap-4 text-sm text-ink-400">
            <a href="#" className="hover:text-brand-600 transition-colors">Privacidad</a>
            <a href="#" className="hover:text-brand-600 transition-colors">Términos</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================
   SCAN LIMIT MODAL
   ============================================================ */

function ScanLimitModal({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 relative animate-zoom-in text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-400 hover:text-ink-600 transition-colors p-1 rounded-lg hover:bg-ink-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-7 h-7 text-brand-600" />
        </div>
        <h2 className="text-xl font-bold text-ink-900 mb-2">Has usado tus 2 escaneos gratis</h2>
        <p className="text-sm text-ink-500 mb-6 leading-relaxed">
          Inicia sesión para seguir escaneando manchas con la IA, o suscríbete a un plan para escaneos ilimitados.
        </p>
        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-all shadow-sm mb-3"
        >
          Iniciar sesión
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl border border-ink-200 text-ink-600 font-medium text-sm hover:bg-ink-50 transition-colors"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   WHATSAPP SHARE
   ============================================================ */

function buildShareText(result: ScanResult): string {
  let text = `*snapcleAIn - Resultado del escaneo*\n\n`;
  text += `*Mancha:* ${result.stainType}\n`;
  text += `*Superficie:* ${result.surface}\n`;
  text += `*Producto recomendado:* ${result.product}\n\n`;
  text += `*Paso a paso:*\n`;
  result.steps.forEach((s, i) => {
    text += `${s.emoji} PASO ${i + 1}: ${s.text}\n`;
  });
  text += `\n*⚠️ Advertencia:* ${result.warning}\n\n`;
  text += `_Analizado con snapcleAIn - IA experta en manchas_`;
  return text;
}

function shareOnWhatsApp(result: ScanResult) {
  const text = buildShareText(result);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/* ============================================================
   GEMINI FOLLOW-UP
   ============================================================ */

async function askFollowUp(
  originalImageFile: File,
  previousResult: ScanResult,
  question: string,
): Promise<string> {
  const { base64, mimeType } = await new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve({ base64: r.split(',')[1] ?? '', mimeType: originalImageFile.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(originalImageFile);
  });

  const contextText = `Resultado previo del análisis:\n- Mancha: ${previousResult.stainType}\n- Superficie: ${previousResult.surface}\n- Producto: ${previousResult.product}\n- Pasos: ${previousResult.steps.map((s) => s.text).join('; ')}\n- Advertencia: ${previousResult.warning}\n\nPregunta adicional del usuario: "${question}"\n\nResponde la pregunta del usuario en español, en texto plano, de forma clara y concisa (máximo 4 frases). No uses Markdown ni asteriscos.`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: contextText },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.4 },
  };

  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error('No se pudo procesar tu pregunta.');
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? '';
  if (!text) throw new Error('La IA no devolvió una respuesta.');
  return text.trim();
}

/* ============================================================
   GEMINI RESPONSE PARSER
   ============================================================ */

function parseGeminiResponse(raw: string, imageUrl: string): ScanResult {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  let stainType = 'Mancha no identificada';
  let surface = '';
  let product = '';
  const steps: { emoji: string; text: string }[] = [];
  let warning = '';

  for (const line of lines) {
    if (line.startsWith('Eso parece una mancha de')) {
      stainType = line.replace('Eso parece una mancha de', '').trim();
      const inMatch = stainType.match(/\ben\s+(.+)$/i);
      if (inMatch) {
        stainType = stainType.replace(/\ben\s+.+$/i, '').trim();
        surface = inMatch[1];
      }
    } else if (line.startsWith('Debes limpiarlo con:')) {
      product = line.replace('Debes limpiarlo con:', '').trim();
    } else if (/^PASO\s+\d+/i.test(line)) {
      const match = line.match(/^PASO\s+\d+\s+(\S+)\s*:?\s*(.*)$/i);
      if (match) {
        steps.push({ emoji: match[1], text: match[2].trim() });
      } else {
        const noEmoji = line.replace(/^PASO\s+\d+\s*:?\s*/i, '').trim();
        steps.push({ emoji: '✨', text: noEmoji });
      }
    } else if (line.startsWith('ADVERTENCIA CRÍTICA:')) {
      warning = line.replace('ADVERTENCIA CRÍTICA:', '').trim();
    }
  }

  return {
    stainType: stainType.charAt(0).toUpperCase() + stainType.slice(1),
    surface: surface || 'Superficie no especificada',
    product: product || 'Ver recomendación',
    steps: steps.length > 0 ? steps : [{ emoji: '✨', text: 'No se pudieron extraer pasos de la respuesta.' }],
    warning: warning || 'Sigue las instrucciones del producto. Si la mancha persiste, consulta a un profesional.',
    imageUrl,
    date: new Date().toISOString(),
  };
}
