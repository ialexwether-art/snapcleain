import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Gem,
  HelpCircle,
  Home,
  Info,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Play,
  ScanLine,
  Share2,
  Shield,
  Sparkles,
  Star,
  Store,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { analyzeWithGemini } from "@/lib/geminiAnalyzer";

const splashContainerStyle: React.CSSProperties = {
  textRendering: "optimizeLegibility",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const FOLLOWUP_SYSTEM_PROMPT = `Eres una IA experta en eliminación de manchas. El usuario ya ha recibido un primer análisis de su mancha y ahora tiene preguntas de seguimiento. Tienes el análisis original y el historial de la conversación. Si el usuario envía una foto nueva, es una foto de cómo ha quedado la mancha tras intentar limpiarla; analízala para dar consejos más precisos. Responde en español, en texto plano (sin Markdown ni asteriscos), de forma clara, directa y práctica. Da trucos concretos y pasos accionables. No inventes productos; si no estás seguro, dile qué tipo de producto buscar.`;

const ABOUT_SYSTEM_PROMPT = `Eres snapcleAIn, una IA experta en limpieza universal. Te especializas en eliminar cualquier mancha en cualquier superficie (textiles, madera, metal, piedra, plástico, etc.). Responde en español, en texto plano (sin Markdown ni asteriscos), de forma cercana, amable y directa. Cuando te pregunten quién eres o en qué te especializas, explícalo con confianza y sencillez. Eres una asistente virtual de confianza que ayuda a las personas a resolver problemas de manchas en su día a día.`;

type ChatMessage = { role: "user" | "model"; text: string };

type StainRecord = {
  id: string;
  image: string;
  note: string;
  analysis: string;
  date: string;
};

type Tab = "inicio" | "biblioteca" | "escanear" | "botiquin" | "premium";
type View = "scan" | "result";
type DrawerPanel = "menu" | "login" | "history" | "plans" | "about" | "wallet" | null;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

const GOOGLE_CANCEL = "__use_another_account__";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string; select_by: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (listener?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDisplayed: () => boolean; getNotDisplayedReason: () => string; getSkippedReason: () => string }) => void) => void;
          disableAutoSelect: () => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope?: string;
          redirectURI?: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => void;
        signIn: (config?: { state?: string; nonce?: string }) => Promise<{
          authorization?: { id_token?: string; code?: string; state?: string };
          user?: { email?: string; name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID ?? "";

function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded?.email ?? null;
  } catch {
    return null;
  }
}

let googleCredentialResolver: ((email: string | null) => void) | null = null;

function onGoogleCredentialResponse(response: { credential: string }): void {
  const email = decodeJwtEmail(response.credential);
  if (googleCredentialResolver) googleCredentialResolver(email);
}

async function signInWithGoogle(): Promise<string | null> {
  if (window.google?.accounts?.id && GOOGLE_CLIENT_ID) {
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (email: string | null) => {
        if (settled) return;
        settled = true;
        googleCredentialResolver = null;
        resolve(email);
      };
      googleCredentialResolver = finish;
      window.google!.accounts!.id!.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google!.accounts!.id!.prompt((notif) => {
        if (notif.isNotDisplayed() || notif.isSkippedMoment()) {
          finish(null);
        }
      });
      setTimeout(() => finish(null), 12000);
    });
  }
  try {
    if (navigator.credentials) {
      const cred = await navigator.credentials.get({
        password: true,
        federated: { providers: ["https://accounts.google.com"] },
        mediation: "required",
      } as any);
      if (cred && (cred as any).id) return (cred as any).id;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return GOOGLE_CANCEL;
    }
  }
  return null;
}

async function signInWithApple(): Promise<string | null> {
  if (window.AppleID?.auth && APPLE_CLIENT_ID) {
    try {
      window.AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "name email",
        redirectURI: window.location.origin,
        usePopup: true,
      });
      const response = await window.AppleID.auth.signIn();
      if (response.user?.email) return response.user.email;
      if (response.authorization?.id_token) {
        const email = decodeJwtEmail(response.authorization.id_token);
        if (email) return email;
      }
      return null;
    } catch {
      return null;
    }
  }
  try {
    if (navigator.credentials) {
      const cred = await navigator.credentials.get({
        password: true,
        federated: { providers: ["https://appleid.apple.com"] },
        mediation: "required",
      } as any);
      if (cred && (cred as any).id) return (cred as any).id;
    }
  } catch {
    // user cancelled or unavailable
  }
  return null;
}

async function saveProfileToSupabase(email: string, provider: string): Promise<void> {
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ email, provider }),
    });
  } catch {
    // non-blocking: profile save is best-effort
  }
}

const HISTORY_KEY = "snapcleain_history";
const GUEST_TOKEN_BALANCE_KEY = "snapcleain_token_balance_guest";
const GUEST_LAST_REFILL_KEY = "snapcleain_last_refill_guest";
const DEFAULT_TOKEN_BALANCE = 3.0;

function tokenBalanceKey(email: string | null): string {
  if (!email) return GUEST_TOKEN_BALANCE_KEY;
  return `snapcleain_token_balance_${email.toLowerCase()}`;
}

function lastRefillKey(email: string | null): string {
  if (!email) return GUEST_LAST_REFILL_KEY;
  return `snapcleain_last_refill_${email.toLowerCase()}`;
}

function loadHistory(): StainRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StainRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(records: StainRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch {
    // storage may be full (large images); ignore
  }
}

function loadTokenBalance(email: string | null = null): number {
  try {
    const raw = localStorage.getItem(tokenBalanceKey(email));
    if (!raw) return DEFAULT_TOKEN_BALANCE;
    const val = parseFloat(raw);
    return isNaN(val) ? DEFAULT_TOKEN_BALANCE : val;
  } catch {
    return DEFAULT_TOKEN_BALANCE;
  }
}

function saveTokenBalance(balance: number, email: string | null = null): void {
  try {
    localStorage.setItem(tokenBalanceKey(email), String(balance));
  } catch {
    // ignore
  }
}

function getLastRefill(email: string | null = null): string | null {
  try {
    return localStorage.getItem(lastRefillKey(email));
  } catch {
    return null;
  }
}

function saveLastRefill(iso: string, email: string | null = null): void {
  try {
    localStorage.setItem(lastRefillKey(email), iso);
  } catch {
    // ignore
  }
}

function getStartOfCurrentSunday(): Date {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - (day === 0 ? 0 : 7 - day));
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

const ACCOUNTS_KEY = "snapcleain_accounts";

type Account = { email: string; password: string };

function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: Account[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

async function askFollowUp(
  originalAnalysis: string,
  history: ChatMessage[],
  question: string,
  photo?: File,
): Promise<string> {
  const contextText = `Análisis original de la mancha:\n${originalAnalysis}`;

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: "user", parts: [{ text: contextText }] },
    { role: "model", parts: [{ text: "Entendido. Tengo el análisis de tu mancha. ¿Qué necesitas saber?" }] },
  ];
  for (const msg of history) {
    contents.push({ role: msg.role, parts: [{ text: msg.text }] });
  }

  const lastParts: Array<Record<string, unknown>> = [{ text: question || "Mira esta foto de cómo ha quedado la mancha tras limpiarla." }];
  if (photo) {
    const { base64, mimeType } = await fileToBase64(photo);
    lastParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
  }
  contents.push({ role: "user", parts: lastParts });

  const body = {
    systemInstruction: { parts: [{ text: FOLLOWUP_SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.5 },
  };

  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;
  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini respondió con error ${res.status}. ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ??
    "";

  if (!text) throw new Error("Gemini no devolvió texto en su respuesta.");
  return text;
}

async function askAbout(history: ChatMessage[], question: string): Promise<string> {
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));
  contents.push({ role: "user", parts: [{ text: question }] });

  const body = {
    systemInstruction: { parts: [{ text: ABOUT_SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.6 },
  };

  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;
  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini respondió con error ${res.status}. ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ??
    "";

  if (!text) throw new Error("Gemini no devolvió texto en su respuesta.");
  return text;
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

/* ---------- Stain Library Data ---------- */

type StainSolution = { surface: string; steps: string[] };
type StainEntry = { id: string; name: string; icon: string; category: string; solutions: StainSolution[] };

const STAIN_LIBRARY: StainEntry[] = [
  { id: "aceite", name: "Aceite", icon: "🛢", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Cubre la mancha con talco o bicarbonato para absorber la grasa.", "Deja actuar 15 minutos, retira el polvo y frota con jabón de platos.", "Lava en ciclo normal con detergente líquido a temperatura alta si la etiqueta lo permite."] },
    { surface: "Sofá", steps: ["Absorbe el exceso con papel sin presionar.", "Aplica alcohol o quitagrasas con un paño limpio, sin empapar.", "Seca presionando con papel y repite si queda rastro."] },
    { surface: "Alfombra", steps: ["Absorbe el exceso con papel sin frotar.", "Aplica una pasta de bicarbonato y agua, deja secar y aspira.", "Aclara con jabón de platos y agua tibia, secando con papel."] },
    { surface: "Madera", steps: ["Absorbe el exceso con papel sin presionar.", "Limpia con un paño húmedo y jabón suave, aclarando bien.", "Seca con un paño suave y pule con producto para madera."] },
  ]},
  { id: "cafe", name: "Café", icon: "☕", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Aclara con agua fría por el reverso de la tela.", "Frota suavemente con jabón de platos y deja actuar 5 minutos.", "Lava en ciclo normal con agua lo más caliente que permita la etiqueta."] },
    { surface: "Sofá", steps: ["Absorbe el exceso con papel sin frotar.", "Aplica agua tibia, vinagre y jabón de platos con un paño.", "Seca presionando con papel y repite si queda color."] },
    { surface: "Alfombra", steps: ["Empapa con agua fría y seca con papel absorbente.", "Aplica vinagre y jabón de platos, deja 5 minutos.", "Aclara con agua fría y seca presionando con un paño."] },
    { surface: "Madera", steps: ["Seca el líquido inmediatamente con un paño suave.", "Limpia con paño húmedo y jabón para madera, aclarando bien.", "Pule con producto específico para madera si queda marca."] },
  ]},
  { id: "vino", name: "Vino", icon: "🍷", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Cubre la mancha con sal fina o bicarbonato para absorber el líquido.", "Deja actuar 10 minutos y enjuaga con agua fría por el reverso.", "Aplica agua oxigenada y jabón de platos, deja 5 minutos y lava."] },
    { surface: "Sofá", steps: ["Seca el exceso con papel absorbente sin presionar.", "Aplica agua con gas o agua fría con jabón de platos con un paño.", "Seca con papel y repite si queda color."] },
    { surface: "Alfombra", steps: ["Empapa con agua con gas o agua fría sin frotar.", "Aplica pasta de bicarbonato y agua, deja secar y aspira.", "Si persiste, usa agua oxigenada con jabón de platos y aclara."] },
    { surface: "Madera", steps: ["Limpia inmediatamente con un paño húmedo.", "Lava con agua tibia y jabón suave, aclarando bien.", "Seca completamente y aplica limpiador específico si hay mancha."] },
  ]},
  { id: "chocolate", name: "Chocolate", icon: "🍫", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Retira el exceso con un cuchillo sin extender la mancha.", "Frota con jabón de platos y deja actuar 5 minutos.", "Lava en ciclo normal con detergente líquido a temperatura alta si permite."] },
    { surface: "Sofá", steps: ["Retira el exceso con una cuchara sin presionar.", "Aplica agua tibia y jabón de platos con un paño limpio.", "Seca presionando con papel y repite si queda rastro."] },
    { surface: "Alfombra", steps: ["Retira el exceso con una cuchara sin extender.", "Aplica jabón de platos y agua tibia con un paño.", "Aclara con agua fría y seca presionando con papel."] },
    { surface: "Madera", steps: ["Retira el exceso sin rayar la superficie.", "Limpia con paño húmedo y jabón suave, aclarando bien.", "Seca con paño suave y pule con producto para madera."] },
  ]},
  { id: "sangre", name: "Sangre", icon: "🩸", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Aclara con agua fría por el reverso lo antes posible, nunca uses agua caliente.", "Frota con jabón de platos o agua oxigenada y deja 5 minutos.", "Lava en ciclo normal con detergente a temperatura baja."] },
    { surface: "Sofá", steps: ["Absorbe el exceso con papel sin presionar.", "Aplica agua fría con jabón de platos con un paño limpio.", "Seca presionando con papel y repite si queda color."] },
    { surface: "Alfombra", steps: ["Absorbe el exceso con papel sin frotar, siempre con agua fría.", "Aplica agua oxigenada con jabón de platos, deja 5 minutos.", "Aclara con agua fría y seca presionando con papel."] },
    { surface: "Madera", steps: ["Limpia inmediatamente con paño húmedo con agua fría.", "Lava con agua y jabón suave, aclarando bien.", "Seca completamente con un paño suave."] },
  ]},
  { id: "pegamento", name: "Pegamento", icon: "🧴", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Deja secar el pegamento completamente.", "Frota suavemente para desprender la capa y aplica agua tibia con jabón.", "Lava en ciclo normal con detergente a temperatura alta si permite."] },
    { surface: "Sofá", steps: ["Deja secar y frota suavemente para desprender.", "Aplica alcohol con un paño limpio, sin empapar.", "Seca presionando con papel y repite si queda rastro."] },
    { surface: "Alfombra", steps: ["Deja secar y raspa suavemente el exceso.", "Aplica alcohol con un paño limpio sin empapar.", "Aclara con agua y jabón de platos, secando con papel."] },
    { surface: "Madera", steps: ["Deja secar el pegamento completamente.", "Frota suavemente para desprender con un paño húmedo.", "Limpia con jabón suave, aclara y seca con paño suave."] },
  ]},
  { id: "tinta", name: "Tinta", icon: "🖊️", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Coloca papel absorbente debajo de la mancha.", "Aplica alcohol con un algodón, cambiando el papel al mancharse.", "Lava en ciclo normal con detergente a temperatura alta si permite."] },
    { surface: "Sofá", steps: ["Aplica alcohol con un paño limpio, sin empapar.", "Seca presionando con papel y repite si queda color.", "Aclara con agua y jabón de platos para retirar restos."] },
    { surface: "Alfombra", steps: ["Absorbe el exceso con papel sin frotar.", "Aplica alcohol con un paño limpio, sin empapar.", "Aclara con agua y jabón de platos, secando con papel."] },
    { surface: "Madera", steps: ["Aplica alcohol con un paño suave, sin empapar.", "Frota suavemente hasta que la tinta se disuelva.", "Seca con paño suave y pule con producto para madera."] },
  ]},
  { id: "tomate", name: "Tomate", icon: "🍅", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Retira el exceso con un cuchillo sin extender.", "Aclara con agua fría por el reverso y frota con jabón de platos.", "Aplica agua oxigenada y bicarbonato, deja 10 minutos y lava."] },
    { surface: "Sofá", steps: ["Retira el exceso con una cuchara sin presionar.", "Aplica agua tibia, vinagre y jabón de platos con un paño.", "Seca presionando con papel y repite si queda color."] },
    { surface: "Alfombra", steps: ["Retira el exceso con una cuchara sin extender.", "Aplica pasta de bicarbonato y agua, deja secar y aspira.", "Aclara con agua fría y jabón de platos, secando con papel."] },
    { surface: "Madera", steps: ["Retira el exceso sin rayar la superficie.", "Limpia con paño húmedo y jabón suave, aclarando bien.", "Seca con paño suave y pule con producto para madera."] },
  ]},
  { id: "cesped", name: "Césped", icon: "🌱", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Deja secar la mancha completamente.", "Cepilla suavemente para retirar el exceso seco.", "Aplica agua tibia y jabón de platos, frota y lava en ciclo normal."] },
    { surface: "Sofá", steps: ["Deja secar y cepilla suavemente el exceso.", "Aplica agua tibia y jabón de platos con un paño limpio.", "Seca presionando con papel y repite si queda rastro."] },
    { surface: "Alfombra", steps: ["Deja secar y aspira o cepilla el exceso.", "Aplica jabón de platos y agua tibia con un paño.", "Aclara con agua fría y seca presionando con papel."] },
    { surface: "Madera", steps: ["Deja secar y retira el exceso con un paño suave.", "Limpia con paño húmedo y jabón suave, aclarando bien.", "Seca con paño suave y pule con producto para madera."] },
  ]},
  { id: "maquillaje", name: "Maquillaje", icon: "💄", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Aplica alcohol o desmaquillante con un paño limpio.", "Frota suavemente y deja actuar 5 minutos.", "Lava en ciclo normal con detergente líquido."] },
    { surface: "Sofá", steps: ["Aplica desmaquillante o alcohol con un paño, sin empapar.", "Seca presionando con papel y repite si queda color.", "Aclara con agua y jabón de platos para retirar restos."] },
    { surface: "Alfombra", steps: ["Absorbe el exceso con papel sin frotar.", "Aplica desmaquillante o alcohol con un paño limpio.", "Aclara con agua y jabón de platos, secando con papel."] },
    { surface: "Madera", steps: ["Limpia con un paño húmedo lo antes posible.", "Aplica alcohol con un paño suave si queda color.", "Seca con paño suave y pule con producto para madera."] },
  ]},
  { id: "humedad", name: "Humedad", icon: "💧", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Frota la zona con vinagre blanco puro.", "Deja actuar 15 minutos y aclara con agua fría.", "Lava en ciclo normal con detergente y media taza de vinagre."] },
    { surface: "Sofá", steps: ["Mezcla vinagre y agua a partes iguales.", "Aplica con un paño limpio sin empapar.", "Seca al aire o con ventilador para evitar que vuelva."] },
    { surface: "Alfombra", steps: ["Aplica vinagre blanco con un paño limpio.", "Esparce bicarbonato por encima y deja secar.", "Aspira completamente tras una hora."] },
    { surface: "Madera", steps: ["Limpia con paño húmedo y vinagre blanco.", "Seca inmediatamente con paño suave.", "Aplica aceite para madera o cera para restaurar el brillo."] },
  ]},
  { id: "oxido", name: "Óxido", icon: "🔩", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Exprime limón sobre la mancha y añade sal.", "Deja actuar 30 minutos al sol si es posible.", "Aclara y lava en ciclo normal con detergente."] },
    { surface: "Sofá", steps: ["Mezcla sal y vinagre hasta formar pasta.", "Aplica sobre el óxido y deja 15 minutos.", "Frota suavemente y aclara con agua."] },
    { surface: "Alfombra", steps: ["Aplica vinagre blanco con un paño limpio.", "Frota suavemente con bicarbonato si persiste.", "Aclara con agua y seca presionando con papel."] },
    { surface: "Madera", steps: ["Aplica pasta de sal y limón sobre el óxido.", "Deja 10 minutos y frota suavemente.", "Seca y aplica producto protector para madera."] },
  ]},
  { id: "barro", name: "Barro", icon: "🌍", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Deja secar el barro completamente.", "Cepilla o raspa el exceso seco con un cuchillo.", "Frota con jabón de platos y agua tibia, luego lava en ciclo normal."] },
    { surface: "Sofá", steps: ["Deja secar y cepilla el exceso seco.", "Aplica agua tibia con jabón de platos con un paño.", "Seca presionando con papel y repite si queda rastro."] },
    { surface: "Alfombra", steps: ["Deja secar y aspira el exceso seco.", "Aplica jabón de platos y agua tibia con un paño.", "Aclara con agua fría y seca presionando con papel."] },
    { surface: "Madera", steps: ["Deja secar y retira el exceso con un paño suave.", "Limpia con paño húmedo y jabón suave, aclarando bien.", "Seca con paño suave y pule con producto para madera."] },
  ]},
  { id: "cera", name: "Cera", icon: "🕯️", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Coloca papel absorbente encima y plancha a temperatura media.", "Cambia el papel hasta que no absorba más cera.", "Frota el resto con alcohol y lava en ciclo normal."] },
    { surface: "Sofá", steps: ["Aplica hielo en bolsa sobre la cera para endurecerla.", "Rasca suavemente con una tarjeta de plástico.", "Limpia el resto con alcohol y un paño limpio."] },
    { surface: "Alfombra", steps: ["Aplica hielo y rasca suavemente la cera endurecida.", "Cubre con papel y plancha a temperatura media.", "Aspira los restos y aplica alcohol si queda rastro."] },
    { surface: "Madera", steps: ["Aplica hielo y raspa suavemente la cera con plástico.", "Limpia el resto con paño húmedo y alcohol.", "Seca y pule con producto para madera."] },
  ]},
  { id: "sudor", name: "Sudor", icon: "💦", category: "organicas", solutions: [
    { surface: "Ropa", steps: ["Mezcla bicarbonato y agua hasta formar pasta.", "Aplica sobre la mancha y deja 30 minutos.", "Aclara y lava en ciclo normal con detergente y vinagre."] },
    { surface: "Sofá", steps: ["Mezcla vinagre y agua a partes iguales.", "Aplica con un paño limpio sin empapar.", "Seca al aire y repite si persiste la marca."] },
    { surface: "Alfombra", steps: ["Aplica bicarbonato sobre la zona afectada.", "Deja actuar 1 hora y aspira completamente.", "Aclara con vinagre y agua si queda rastro."] },
    { surface: "Madera", steps: ["Limpia con paño húmedo y jabón suave.", "Aplica vinagre diluido si persiste la marca.", "Seca con paño suave y pule con producto para madera."] },
  ]},
];

/* ---------- Botiquin (Product Catalog) Data ---------- */

type ProductCategory = "basicos" | "ecologicos" | "herramientas";

type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  material: string;
  description: string;
  amazonUrl: string;
  imageUrl: string;
};

const PRODUCT_CATEGORIES: { id: ProductCategory; label: string }[] = [
  { id: "basicos", label: "Básicos" },
  { id: "ecologicos", label: "Ecológicos" },
  { id: "herramientas", label: "Herramientas" },
];

const PRODUCTS: Product[] = [
  { id: "vanish-oxi-action", name: "Vanish Oxi Action", category: "basicos", material: "Tejidos", description: "Quitamanchas en polvo con oxígeno activo para ropa blanca y de color.", amazonUrl: "https://www.amazon.es/s?k=vanish+oxi+action", imageUrl: "/vanish-oxi-action.webp" },
  { id: "kh-7-professional", name: "KH-7 Profesional", category: "basicos", material: "Multisuperficie", description: "Quitamanchas y desengrasante multiusos profesional.", amazonUrl: "https://www.amazon.es/s?k=kh+7+profesional", imageUrl: "/kh-7-professional.webp" },
  { id: "fairy-ultra", name: "Fairy Ultra", category: "basicos", material: "Multisuperficie", description: "Jabón de platos concentrado ultradesengrasante.", amazonUrl: "https://www.amazon.es/s?k=fairy+ultra", imageUrl: "/fairy-ultra.webp" },
  { id: "limon-natural", name: "Limón natural", category: "ecologicos", material: "Multisuperficie", description: "Ácido natural que desengrasa, blanquea y elimina olores.", amazonUrl: "https://www.amazon.es/s?k=limon+limpieza+natural", imageUrl: "/limon-natural.webp" },
  { id: "escamas-jabon", name: "Escamas de jabón", category: "ecologicos", material: "Tejidos", description: "Jabón natural en escamas para ropa delicada y limpia.", amazonUrl: "https://www.amazon.es/s?k=escamas+jabon+natural", imageUrl: "/escamas-jabon.webp" },
  { id: "the-pink-stuff", name: "The Pink Stuff", category: "ecologicos", material: "Multisuperficie", description: "Pasta limpiadora milagrosa para todo tipo de superficies.", amazonUrl: "https://www.amazon.es/s?k=the+pink+stuff+cleaning+paste", imageUrl: "/the-pink-stuff.webp" },
  { id: "dr-beckmann-mago", name: "Dr. Beckmann Mago del Blanco", category: "ecologicos", material: "Tejidos", description: "Quitamanchas líquido universal para ropa blanca y de color.", amazonUrl: "https://www.amazon.es/s?k=dr+beckmann+mago+del+blanco", imageUrl: "/dr-beckmann-mago.webp" },
  { id: "guantes", name: "Guantes de protección", category: "herramientas", material: "Multisuperficie", description: "Protege tus manos durante la limpieza.", amazonUrl: "https://www.amazon.es/s?k=guantes+proteccion+limpieza", imageUrl: "/guantes.webp" },
  { id: "cepillo-cerdas", name: "Cepillo de cerdas", category: "herramientas", material: "Multisuperficie", description: "Frota sin rayar superficies delicadas.", amazonUrl: "https://www.amazon.es/s?k=cepillo+cerdas+suaves+limpieza", imageUrl: "/cepillo.webp" },
  { id: "pano-microfibra", name: "Paño de microfibra", category: "herramientas", material: "Multisuperficie", description: "Recoge suciedad y deja brillo sin marcas.", amazonUrl: "https://www.amazon.es/s?k=pano+microfibra+limpieza", imageUrl: "/panos-microfibra.webp" },
];

/* ---------- Wallet Badge ---------- */

type WalletBadgeProps = {
  balance: number;
  onClick?: () => void;
  compact?: boolean;
};

function WalletBadge({ balance, onClick, compact = false }: WalletBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? "flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-yellow-50 border border-amber-300 px-1.5 py-0.5 shadow-sm transition-all hover:scale-105 active:scale-95"
          : "flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-50 border border-amber-300 px-2.5 py-1 shadow-sm transition-all hover:scale-105 active:scale-95"
      }
    >
      <Wallet className={compact ? "h-3 w-3 text-amber-600" : "h-4 w-4 text-amber-600"} />
      <span className={
        compact
          ? "text-xs font-bold text-amber-700 tabular-nums"
          : "text-sm font-extrabold text-amber-700 tabular-nums"
      }>
        {balance.toFixed(2)}
      </span>
      <Gem className={compact ? "h-2.5 w-2.5 text-amber-500" : "h-3.5 w-3.5 text-amber-500"} />
    </button>
  );
}

/* ---------- Subscription Plans ---------- */

const SUBSCRIPTION_PLANS = [
  {
    name: "Gratuito",
    price: "0",
    icon: <Sparkles className="h-5 w-5 text-blue-500" />,
    features: [
      "3 tokens iniciales de regalo",
      "1 token de recarga cada semana",
      "Ver anuncios voluntarios por +0,25 créditos",
    ],
    accent: "border-blue-200 bg-blue-50",
    isFree: true,
  },
  {
    name: "Aficionado",
    price: "3,99",
    icon: <Star className="h-5 w-5 text-blue-500" />,
    features: [
      "5 tokens de recarga automáticos cada semana",
      "Acceso al historial guardado",
      "Mantiene los anuncios en la app",
    ],
    accent: "border-blue-200 bg-blue-50",
  },
  {
    name: "Limpieza Total",
    price: "7,99",
    icon: <Crown className="h-5 w-5 text-amber-500" />,
    features: [
      "Tokens infinitos e ilimitados",
      "Velocidad VIP",
      "Chat prioritario",
      "Elimina por completo todos los anuncios",
    ],
    accent: "border-amber-200 bg-amber-50",
    highlight: true,
  },
];

/* ---------- Stripe Checkout Card ---------- */

type StripeCheckoutCardProps = {
  planName: string;
  planPrice: string;
  onClose: () => void;
};

function StripeCheckoutCard({ planName, planPrice, onClose }: StripeCheckoutCardProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const canSubmit = cardNumber.replace(/\s/g, "").length === 16 && expiry.length === 5 && cvc.length >= 3;

  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 sm:px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] rounded-3xl bg-white p-5 sm:p-6 shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#635bff]">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-black">Pagar con Stripe</h3>
              <p className="text-xs font-medium text-gray-500">Plan {planName} · {planPrice}€/mes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
            aria-label="Cerrar pago"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-sm font-bold text-black">¡Suscripción activada!</p>
            <p className="text-xs font-medium text-gray-500">Tu plan {planName} está listo para usar.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-xl bg-[#635bff] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#5851eb]"
            >
              Continuar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-black">Número de tarjeta</label>
              <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 focus-within:border-[#635bff]">
                <CreditCard className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="4242 4242 4242 4242"
                  className="h-11 w-full bg-transparent text-sm font-medium text-black outline-none placeholder:text-gray-400"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-black">Caducidad</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/AA"
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm font-medium text-black outline-none focus:border-[#635bff]"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-black">CVC</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="123"
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm font-medium text-black outline-none focus:border-[#635bff]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!canSubmit) return;
                setProcessing(true);
                setTimeout(() => {
                  setProcessing(false);
                  setSuccess(true);
                }, 3000);
              }}
              disabled={!canSubmit || processing}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#635bff] text-sm font-bold uppercase tracking-wide text-white shadow-md transition-all hover:bg-[#5851eb] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Pagar {planPrice}€/mes
                </>
              )}
            </button>
            <p className="flex items-center justify-center gap-1 text-center text-xs font-medium text-gray-400">
              <Lock className="h-3 w-3" />
              Pago seguro cifrado con Stripe
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Out of Tokens Alert ---------- */

type OutOfTokensAlertProps = {
  adLoading: boolean;
  onClose: () => void;
  onWatchAd: () => void;
  onOpenPlans: () => void;
};

function OutOfTokensAlert({ adLoading, onClose, onWatchAd, onOpenPlans }: OutOfTokensAlertProps) {
  return (
    <div
      className="absolute inset-0 z-[75] flex items-center justify-center bg-black/50 px-4 sm:px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[300px] rounded-3xl bg-white p-5 sm:p-6 shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h3 className="text-base font-bold text-black">Te has quedado sin tokens</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">Ve un anuncio por +0,25 o hazte premium.</p>
        </div>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onWatchAd}
            disabled={adLoading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold uppercase tracking-wide text-white shadow-md transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
          >
            {adLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Play className="h-5 w-5" />
                Ver Anuncio (+0,25)
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenPlans}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold uppercase tracking-wide text-white shadow-md transition-all hover:bg-[#0a6fd4] active:scale-[0.98]"
          >
            <CreditCard className="h-5 w-5" />
            Ver Planes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Wallet Shop Card ---------- */

type WalletShopCardProps = {
  balance: number;
  adLoading: boolean;
  onClose: () => void;
  onWatchAd: () => void;
};

function WalletShopCard({ balance, adLoading, onClose, onWatchAd }: WalletShopCardProps) {
  const [checkoutPlan, setCheckoutPlan] = useState<{ name: string; price: string } | null>(null);

  return (
    <div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 sm:px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] max-h-[90%] overflow-y-auto rounded-3xl bg-white p-5 sm:p-6 shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
              <Wallet className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-black">Tienda de Tokens</h3>
              <p className="text-xs font-medium text-amber-600">Saldo: {balance.toFixed(2)} tokens</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
            aria-label="Cerrar tienda"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border-2 p-3 ${plan.accent} ${plan.highlight ? "ring-2 ring-amber-300" : ""}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {plan.icon}
                  <h4 className="text-sm font-bold text-black">{plan.name}</h4>
                  {plan.highlight && (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      Popular
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xl font-extrabold text-black">{plan.price}</span>
                  <span className="text-xs font-bold text-gray-500">€/mes</span>
                </div>
              </div>
              <ul className="mb-2 space-y-0.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs font-medium text-black">
                    <Check className="h-3 w-3 shrink-0 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.isFree ? (
                <div className="flex h-9 w-full items-center justify-center rounded-xl bg-gray-100 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Plan actual
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCheckoutPlan({ name: plan.name, price: plan.price })}
                  className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                    plan.highlight
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-blue-600 text-white hover:bg-[#0a6fd4]"
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Suscribirme ahora
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-black">Ver Anuncio</p>
                <p className="text-xs font-medium text-amber-600">Gana +0,25 créditos gratis</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onWatchAd}
              disabled={adLoading}
              className="flex h-9 items-center justify-center rounded-xl bg-amber-500 px-4 text-xs font-bold uppercase text-white transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50"
            >
              {adLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver"}
            </button>
          </div>
        </div>
      </div>

      {checkoutPlan && (
        <StripeCheckoutCard
          planName={checkoutPlan.name}
          planPrice={checkoutPlan.price}
          onClose={() => setCheckoutPlan(null)}
        />
      )}
    </div>
  );
}

/* ---------- Login Card ---------- */

type LoginCardProps = {
  onClose: () => void;
  onSuccess: (email: string) => void;
  accounts: Account[];
  onRegister: (account: Account) => void;
};

function LoginCard({ onClose, onSuccess, accounts, onRegister }: LoginCardProps) {
  const [email, setEmail] = useState("");
  const [emailFormatError, setEmailFormatError] = useState(false);
  const [socialPicker, setSocialPicker] = useState<"google" | "apple" | "phone" | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [socialEmail, setSocialEmail] = useState("");
  const [socialPassword, setSocialPassword] = useState("");
  const [showSocialPassword, setShowSocialPassword] = useState(false);
  const [socialError, setSocialError] = useState(false);
  const [socialEmailError, setSocialEmailError] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleContinueEmail = () => {
    const e = email.trim();
    if (!e) return;
    if (!isValidEmail(e)) {
      setEmailFormatError(true);
      return;
    }
    setEmailFormatError(false);
    setStep("password");
    setTimeout(() => passwordRef.current?.focus(), 100);
  };

  const handleContinuePassword = () => {
    const e = email.trim();
    const pw = password;
    if (pw.length < 6) {
      setPasswordError(true);
      return;
    }
    setPasswordError(false);
    setAuthLoading(true);
    const existing = accounts.find((a) => a.email.toLowerCase() === e.toLowerCase());
    if (existing) {
      if (existing.password !== pw) {
        setAuthLoading(false);
        setPasswordError(true);
        return;
      }
    } else {
      onRegister({ email: e, password: pw });
    }
    setTimeout(() => {
      setAuthLoading(false);
      onSuccess(e);
    }, 300);
  };

  const handleBackToEmail = () => {
    setStep("email");
    setPassword("");
    setPasswordError(false);
    setTimeout(() => emailRef.current?.focus(), 100);
  };

  const handleGoogle = async () => {
    try {
      if (!navigator.credentials || typeof navigator.credentials.get !== "function") {
        return;
      }
      const cred = await navigator.credentials.get({
        password: true,
        mediation: "required",
      } as CredentialRequestOptions & { password: boolean });
      if (cred) {
        const email = cred.id;
        const password = (cred as unknown as { password?: string }).password || "";
        await saveProfileToSupabase(email, "google");
        onRegister({ email, password: password || Math.random().toString(36).slice(2) });
        onSuccess(email);
      }
    } catch {
      // user cancelled or API unavailable — no fallback to fake picker
    }
  };
  const handleApple = () => setSocialPicker("apple");
  const handlePhone = () => setSocialPicker("phone");

  const handleSocialCredentialSubmit = async () => {
    const e = socialEmail.trim();
    if (!isValidEmail(e)) {
      setSocialEmailError(true);
      return;
    }
    if (socialPassword.length < 6) {
      setSocialError(true);
      return;
    }
    setSocialEmailError(false);
    setSocialError(false);
    await saveProfileToSupabase(e, socialPicker!);
    onRegister({ email: e, password: socialPassword });
    setSocialPicker(null);
    setSocialEmail("");
    setSocialPassword("");
    onSuccess(e);
  };

  const handlePhoneSubmit = async () => {
    const phone = phoneInput.trim();
    if (!phone) return;
    const emailFromPhone = `${phone}@phone.snapcleain.app`;
    await saveProfileToSupabase(emailFromPhone, "phone");
    onRegister({ email: emailFromPhone, password: Math.random().toString(36).slice(2) });
    setSocialPicker(null);
    onSuccess(emailFromPhone);
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 sm:px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] space-y-6 rounded-3xl bg-white p-10 shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb] active:scale-90"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h2 className="text-[22px] font-bold leading-tight text-black">
            Iniciar sesión o registrarse
          </h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-gray-500">
            Obtendrás respuestas más inteligentes y podrás cargar archivos, imágenes y mucho más.
          </p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={socialPicker !== null}
            className="flex h-13 sm:h-13 w-full items-center justify-center gap-3 rounded-full border border-[#e5e7eb] bg-white py-3.5 text-sm font-semibold text-black transition-all hover:bg-[#f7f7f8] active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <button
            type="button"
            onClick={handleApple}
            disabled={socialPicker !== null}
            className="flex h-13 sm:h-13 w-full items-center justify-center gap-3 rounded-full border border-[#e5e7eb] bg-white py-3.5 text-sm font-semibold text-black transition-all hover:bg-[#f7f7f8] active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C5.22 15.6 4.91 8.5 8.25 6.1c1.35-.96 2.5-.85 3.48-.5.9.32 1.5.5 2.5.5 1 0 1.6-.18 2.5-.5.98-.35 2.13-.46 3.48.5 3.34 2.4 3.03 9.5-1.16 14.18zM12 5.5c-.1-2.2 1.8-4 3.8-4.2.3 2.5-2.1 4.3-3.8 4.2z"/>
            </svg>
            Continuar con Apple
          </button>

          <button
            type="button"
            onClick={handlePhone}
            disabled={socialPicker !== null}
            className="flex h-13 sm:h-13 w-full items-center justify-center gap-3 rounded-full border border-[#e5e7eb] bg-white py-3.5 text-sm font-semibold text-black transition-all hover:bg-[#f7f7f8] active:scale-[0.98] disabled:opacity-50"
          >
            <Phone className="h-5 w-5 shrink-0 text-gray-700" />
            Continuar con el teléfono
          </button>
        </div>

        <div className="my-7 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e5e7eb]" />
          <span className="text-xs font-medium text-gray-400">o</span>
          <div className="h-px flex-1 bg-[#e5e7eb]" />
        </div>

        {step === "email" && (
          <div>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailFormatError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleContinueEmail(); } }}
              placeholder="Dirección de correo electrónico"
              className={`h-13 w-full rounded-lg border bg-white px-4 py-3.5 text-sm font-medium text-black outline-none transition-colors placeholder:text-gray-400 focus:border-[#087ff5] ${emailFormatError ? "border-red-400" : "border-[#e5e7eb]"}`}
            />
            {emailFormatError && (
              <p className="mt-2 text-xs font-medium text-red-500">
                Este correo electrónico no es válido
              </p>
            )}
            <button
              type="button"
              onClick={handleContinueEmail}
              disabled={socialPicker !== null}
              className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-[#087ff5] py-4 text-base font-bold text-white shadow-[0_4px_14px_rgba(8,127,245,0.4)] transition-all hover:bg-[#0a6fd4] active:scale-[0.98] disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )}

        {step === "password" && (
          <div className="animate-fade-in">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleBackToEmail}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb] active:scale-90"
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">{email.trim()}</span>
              </div>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleContinuePassword(); } }}
                placeholder="Contraseña (mínimo 6 caracteres)"
                className={`h-13 w-full rounded-lg border bg-white pl-11 pr-11 py-3.5 text-sm font-medium text-black outline-none transition-colors placeholder:text-gray-400 focus:border-[#087ff5] ${passwordError ? "border-red-400" : "border-[#e5e7eb]"}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#f3f4f6] hover:text-gray-600"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordError && (
              <p className="mt-2 text-xs font-medium text-red-500">
                {password.length < 6 ? "La contraseña debe tener al menos 6 caracteres" : "Contraseña incorrecta"}
              </p>
            )}
            <button
              type="button"
              onClick={handleContinuePassword}
              disabled={socialPicker !== null || authLoading}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#087ff5] py-4 text-base font-bold text-white shadow-[0_4px_14px_rgba(8,127,245,0.4)] transition-all hover:bg-[#0a6fd4] active:scale-[0.98] disabled:opacity-50"
            >
              {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              {accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase()) ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          </div>
        )}

        <p className="mt-7 text-center text-xs font-medium leading-relaxed text-gray-400">
          Al continuar, aceptas nuestros Términos de Uso y reconoces haber leído nuestra Política de Privacidad.
        </p>

        {socialPicker && (
          <div
            className="absolute inset-0 z-[10] flex items-center justify-center rounded-3xl bg-black/40 animate-fade-in"
            onClick={() => setSocialPicker(null)}
          >
            <div
              className="w-full max-w-[300px] rounded-2xl bg-white p-5 shadow-2xl animate-pop-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-black">
                  {socialPicker === "google" ? "Elige cuenta de Google" : socialPicker === "apple" ? "Elige cuenta de Apple" : "Acceso por teléfono"}
                </h3>
                <button
                  type="button"
                  onClick={() => setSocialPicker(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {socialPicker === "phone" ? (
                <div className="space-y-3">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handlePhoneSubmit(); } }}
                    placeholder="Introduce tu número"
                    className="h-12 w-full rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-medium text-black outline-none focus:border-[#087ff5]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handlePhoneSubmit}
                    disabled={!phoneInput.trim()}
                    className="flex h-12 w-full items-center justify-center rounded-xl bg-[#087ff5] text-sm font-bold text-white transition-all hover:bg-[#0a6fd4] active:scale-[0.98] disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="email"
                    value={socialEmail}
                    onChange={(e) => { setSocialEmail(e.target.value); setSocialEmailError(false); setSocialError(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!isValidEmail(e.currentTarget.value.trim())) { setSocialEmailError(true); return; } (document.getElementById("social-pw") as HTMLInputElement)?.focus(); } }}
                    placeholder="Correo electrónico"
                    className={`h-12 w-full rounded-lg border bg-white px-4 text-sm font-medium text-black outline-none focus:border-[#087ff5] ${socialEmailError ? "border-red-400" : "border-[#e5e7eb]"}`}
                    autoFocus
                  />
                  {socialEmailError && (
                    <p className="text-xs font-medium text-red-500">Este correo electrónico no es válido</p>
                  )}
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="social-pw"
                      type={showSocialPassword ? "text" : "password"}
                      value={socialPassword}
                      onChange={(e) => { setSocialPassword(e.target.value); setSocialError(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSocialCredentialSubmit(); } }}
                      placeholder="Contraseña (mínimo 6 caracteres)"
                      className="h-12 w-full rounded-lg border border-[#e5e7eb] bg-white pl-10 pr-10 text-sm font-medium text-black outline-none focus:border-[#087ff5]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSocialPassword(!showSocialPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-[#f3f4f6]"
                      aria-label={showSocialPassword ? "Ocultar" : "Mostrar"}
                    >
                      {showSocialPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {socialError && (
                    <p className="text-xs font-medium text-red-500">
                      La contraseña debe tener al menos 6 caracteres.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleSocialCredentialSubmit}
                    disabled={!socialEmail.trim() || socialPassword.length < 6}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#087ff5] text-sm font-bold text-white transition-all hover:bg-[#0a6fd4] active:scale-[0.98] disabled:opacity-50"
                  >
                    {socialPicker === "google" ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C5.22 15.6 4.91 8.5 8.25 6.1c1.35-.96 2.5-.85 3.48-.5.9.32 1.5.5 2.5.5 1 0 1.6-.18 2.5-.5.98-.35 2.13-.46 3.48.5 3.34 2.4 3.03 9.5-1.16 14.18zM12 5.5c-.1-2.2 1.8-4 3.8-4.2.3 2.5-2.1 4.3-3.8 4.2z"/></svg>
                    )}
                    Continuar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- About Panel ---------- */

type AboutPanelProps = {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
};

function AboutPanel({ messages, input, loading, onInputChange, onSend, onClose }: AboutPanelProps) {
  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-white p-4 sm:p-6 animate-slide-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-[#087ff5]" />
          <h2 className="text-lg font-bold text-black">Acerca de nosotros</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <p className="mb-4 text-sm font-semibold leading-relaxed text-black">
        Soy snapcleAIn, tu IA experta en limpieza universal.
      </p>

      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="whitespace-pre-wrap rounded-2xl bg-[#087ff5] px-3 py-2 text-sm font-medium text-white max-w-[80%] text-right">
                {msg.text}
              </p>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <p className="whitespace-pre-wrap rounded-2xl bg-[#f3f4f6] px-3 py-2 text-sm font-medium text-black max-w-[85%]">
                {msg.text}
              </p>
            </div>
          ),
        )}
        {loading && (
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#087ff5]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#087ff5] [animation-delay:0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#087ff5] [animation-delay:0.3s]" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[#e5e7eb] pt-3">
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Pregúntale cualquier cosa a la IA..."
          className="h-11 min-w-0 flex-1 rounded-full border border-[#e5e7eb] bg-white px-4 text-sm font-medium text-black outline-none transition-colors placeholder:text-gray-700 focus:border-[#087ff5]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={loading || !input.trim()}
          aria-label="Enviar pregunta"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#087ff5] text-white shadow-[0_4px_14px_rgba(8,127,245,0.4)] transition-all hover:bg-[#0a6fd4] active:scale-[0.9] disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

/* ---------- History Panel ---------- */

type HistoryPanelProps = {
  history: StainRecord[];
  onClose: () => void;
  onLoad: (record: StainRecord) => void;
  onDelete: (id: string) => void;
};

function HistoryPanel({ history, onClose, onLoad, onDelete }: HistoryPanelProps) {
  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-white p-4 sm:p-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#087ff5]" />
          <h2 className="text-lg font-bold text-black">Mi Historial de Manchas</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
          aria-label="Cerrar historial"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto">
        {history.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Clock className="h-8 w-8 text-[#d1d5db]" />
            <p className="text-sm font-medium leading-relaxed text-black">
              Tu historial está vacío. ¡Escanea tu primera mancha para guardarla aquí automáticamente!
            </p>
          </div>
        )}

        <div className="space-y-2">
          {history.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-2.5 transition-all hover:border-[#087ff5] hover:shadow-[0_2px_12px_rgba(8,127,245,0.12)]"
            >
              <button
                type="button"
                onClick={() => onLoad(record)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f9fafb]">
                  {record.image ? (
                    <img src={record.image} alt={record.note} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Camera className="h-4 w-4 text-black" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-black">{record.note}</p>
                  <p className="truncate text-xs font-medium text-black">{formatDate(record.date)}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(record.id)}
                aria-label="Eliminar mancha"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Drawer Menu ---------- */

type DrawerMenuProps = {
  onClose: () => void;
  onSelect: (panel: Exclude<DrawerPanel, "menu">) => void;
};

function DrawerMenu({ onClose, onSelect }: DrawerMenuProps) {
  const items = [
    { id: "login" as const, label: "Iniciar Sesión", desc: "Accede a tu cuenta", icon: <LogIn className="h-5 w-5 text-blue-600" /> },
    { id: "history" as const, label: "Mi Historial de Manchas", desc: "Tus manchas guardadas", icon: <Clock className="h-5 w-5 text-[#087ff5]" /> },
    { id: "plans" as const, label: "Planes de Suscripción", desc: "0€ · 3,99€ · 7,99€ al mes", icon: <CreditCard className="h-5 w-5 text-amber-500" /> },
    { id: "about" as const, label: "Acerca de nosotros", desc: "Chatea sobre la IA", icon: <Info className="h-5 w-5 text-[#087ff5]" /> },
  ];

  return (
    <div className="absolute inset-0 z-[60] flex" onClick={onClose}>
      <div
        className="flex h-full w-[280px] max-w-[80%] flex-col bg-white p-4 sm:p-5 animate-slide-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#087ff5]" />
            <h2 className="text-lg font-bold text-black">Menú</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-3 text-left transition-all hover:border-[#087ff5] hover:shadow-[0_2px_12px_rgba(8,127,245,0.12)] active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6]">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-black">{item.label}</p>
                <p className="truncate text-xs font-medium text-gray-500">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-[#e5e7eb] pt-4 text-center">
          <p className="text-xs font-medium text-gray-400">snapcleAIn v1.0</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Snap Logo (hand snap with AI sparkles) ---------- */

function SnapLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="handGrad" x1="16" y1="14" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="snapGrad" x1="20" y1="8" x2="44" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="0.5" stopColor="#087ff5" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      {/* Finger-snap hand - filled stylized shape */}
      <g fill="url(#handGrad)" stroke="#bae6fd" strokeWidth="0.5" strokeLinejoin="round" strokeLinecap="round">
        {/* Palm / fist base */}
        <path d="M22 50 C18 47 16 42 18 37 C19 34 22 33 25 34 L25 31 C25 28.5 27 27 29 27.5 C30.5 28 31 29.5 31 31.5 L31 35 C33 33.5 36 33.5 38.5 35 C41 36.5 41.5 39.5 40 42 C37.5 46 33 49 28 49.5 C26 49.5 24 49.5 22 50 Z" />
        {/* Thumb - extends up-right, the snapper */}
        <path d="M38 35 C40 32 42 28 43 24 C43.5 22 42.5 20 41 20 C39.5 20 38.5 22 38 24 C37 27 36 30 35 33 Z" />
        {/* Index finger - presses against thumb, points up-left */}
        <path d="M25 31 C24 27 23 22 23.5 18 C24 15.5 26 14.5 27.5 15.5 C28.5 16.5 28.5 18.5 28 21 L28.5 31 Z" />
      </g>
      {/* Snap burst - golden star at the contact point between thumb and index */}
      <path d="M33 7 L34.5 12 L39.5 13.5 L34.5 15 L33 20 L31.5 15 L26.5 13.5 L31.5 12 Z" fill="#FBBF24" />
      {/* Small sparkle particles around the snap */}
      <circle cx="42" cy="10" r="1" fill="#FBBF24" opacity="0.8" />
      <circle cx="24" cy="9" r="0.8" fill="#FDE68A" opacity="0.7" />
      <circle cx="47" cy="18" r="0.7" fill="#FBBF24" opacity="0.6" />
      {/* AI sparkle stars - surrounding the hand */}
      <path d="M56 6 L57.5 10.5 L62 12 L57.5 13.5 L56 18 L54.5 13.5 L50 12 L54.5 10.5 Z" fill="#FBBF24" />
      <path d="M6 10 L7 13 L10 14 L7 15 L6 18 L5 15 L2 14 L5 13 Z" fill="#FDE68A" opacity="0.7" />
      <path d="M58 36 L58.8 38.5 L61 39.3 L58.8 40 L58 42.5 L57.2 40 L55 39.3 L57.2 38.5 Z" fill="#FBBF24" opacity="0.6" />
      <path d="M8 46 L8.8 48 L10.8 48.8 L8.8 49.5 L8 51.5 L7.2 49.5 L5.2 48.8 L7.2 48 Z" fill="#FDE68A" opacity="0.5" />
    </svg>
  );
}

/* ---------- Inicio Page (ChatGPT-style blue splash) ---------- */

type InicioPageProps = {
  onEnter: () => void;
  onOpenAbout: () => void;
  onOpenDrawer: () => void;
  isLoggedIn: boolean;
  onOpenProfile: () => void;
  onOpenLogin: () => void;
};

function InicioPage({ onEnter, onOpenAbout, onOpenDrawer, isLoggedIn, onOpenProfile, onOpenLogin }: InicioPageProps) {
  return (
    <div
      className="flex h-full flex-col items-center justify-between rounded-2xl sm:rounded-3xl lg:rounded-2xl bg-blue-600 p-4 sm:p-6 lg:p-10"
      style={splashContainerStyle}
    >
      {/* Top: menu + brand (left) + login (right) */}
      <div className="flex w-full items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 active:scale-90 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>

        </div>
        <button
          type="button"
          onClick={() => (isLoggedIn ? onOpenProfile() : onOpenLogin())}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-white/60 px-3 text-white transition-colors hover:bg-white/15 active:scale-95"
          aria-label={isLoggedIn ? "Perfil" : "Iniciar sesión"}
        >
          {isLoggedIn ? <User className="h-5 w-5" /> : <LogIn className="h-4 w-4" />}
          <span className="text-xs font-semibold">
            {isLoggedIn
              ? (navigator.language.startsWith("es") ? "Perfil" : "Profile")
              : (navigator.language.startsWith("es") ? "Iniciar sesión" : "Sign In")}
          </span>
        </button>
      </div>

      <div className="flex w-full flex-1 items-center justify-center">
        <h1
          className="font-brand -translate-y-8 sm:-translate-y-16 lg:-translate-y-24 text-center leading-none"
          style={{
            fontSize: "clamp(1.75rem, 8vw, 3.5rem)",
            fontWeight: 800,
            letterSpacing: "0.01em",
            color: "#000553",
          }}
        >
          snapcle
          <span
            style={{
              background: "linear-gradient(180deg, #263c91 0%, #05a6e8 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            AI
          </span>
          n
        </h1>
      </div>

      {/* Bottom: about button + CTA with elegant spacing */}
      <div className="flex w-full flex-col items-center space-y-3 sm:space-y-4 pb-2 sm:pb-3">
        <button
          type="button"
          onClick={onOpenAbout}
          className="flex items-center gap-2 rounded-full border border-white/40 px-6 py-2.5 text-white transition-colors hover:bg-white/15 active:scale-95"
        >
          <HelpCircle className="h-5 w-5" />
          <span className="text-sm font-semibold">¿Qué puedes hacer?</span>
        </button>
        <button
          type="button"
          onClick={onEnter}
          className="flex h-14 w-full max-w-[280px] lg:max-w-[320px] items-center justify-center rounded-full bg-white text-base lg:text-lg font-bold text-[#0a47a3] shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          ENTRAR A LA APP
        </button>
      </div>
    </div>
  );
}

/* ---------- Biblioteca Page (stain library) ---------- */

type BibliotecaPageProps = {
  onOpenDrawer: () => void;
  onOpenWallet: () => void;
  tokenBalance: number;
};


function BibliotecaPage({ onOpenDrawer, onOpenWallet, tokenBalance }: BibliotecaPageProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = STAIN_LIBRARY;

  return (
    <section className="flex w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-white pb-2">
        <div className="w-full flex justify-between items-center pt-1 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>

          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-[-0.5px] text-black">Biblioteca</h1>
          <div className="flex items-center gap-2 mr-1">
            <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
          </div>
        </div>

        <p className="mb-2 text-sm font-medium text-gray-500">
          Toca una mancha para ver la solución exacta paso a paso.
        </p>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden transition-all"
          >
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[#f9fafb] active:scale-[0.98]"
            >
              <span className="text-2xl">{entry.icon}</span>
              <span className="flex-1 text-sm font-bold text-black">{entry.name}</span>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expandedId === entry.id ? "rotate-90" : ""}`}
              />
            </button>

            {expandedId === entry.id && (
              <div className="space-y-3 px-4 pb-4 animate-fade-in">
                {entry.solutions.map((sol, si) => (
                  <div key={si} className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#087ff5]">
                      {sol.surface}
                    </p>
                    <ol className="space-y-2">
                      {sol.steps.map((step, sti) => (
                        <li key={sti} className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#087ff5] text-[10px] font-bold text-white">
                            {sti + 1}
                          </span>
                          <span className="text-sm font-medium leading-relaxed text-black">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Escanear Page (scan + result) ---------- */

type ScanPageProps = {
  stainNote: string;
  loading: boolean;
  hasImage: boolean;
  imagePreview: string | null;
  tokenBalance: number;
  onNoteChange: (value: string) => void;
  onOpenCamera: () => void;
  onRunAnalysis: () => void;
  onRemovePhoto: () => void;
  onOpenDrawer: () => void;
  onOpenWallet: () => void;
  onOutOfTokens: () => void;
  isLoggedIn: boolean;
  onOpenProfile: () => void;
  onOpenLogin: () => void;
};

function ScanPage({
  stainNote,
  loading,
  hasImage,
  imagePreview,
  tokenBalance,
  onNoteChange,
  onOpenCamera,
  onRunAnalysis,
  onRemovePhoto,
  onOpenDrawer,
  onOpenWallet,
  onOutOfTokens,
  isLoggedIn,
  onOpenProfile,
  onOpenLogin,
}: ScanPageProps) {
  return (
    <section className="flex w-full flex-1 flex-col overflow-hidden">
      {/* Top bar: menu + wallet/login */}
      <div className="flex w-full items-center justify-between pt-1 pb-3">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90 lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden lg:flex items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-bold tracking-[-0.5px] text-black">Escanear</h1>
        </div>
        <div className="flex items-center gap-2">
          <WalletBadge balance={tokenBalance} onClick={onOpenWallet} compact />
          <button
            type="button"
            onClick={() => (isLoggedIn ? onOpenProfile() : onOpenLogin())}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[#e5e7eb] px-2.5 text-black transition-colors hover:bg-[#f3f4f6] active:scale-95"
            aria-label={isLoggedIn ? "Perfil" : "Iniciar sesión"}
          >
            {isLoggedIn ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            <span className="text-xs font-semibold">
              {isLoggedIn ? "Perfil" : "Iniciar sesión"}
            </span>
          </button>
        </div>
      </div>

      <div className="flex w-full flex-col items-center px-3 sm:px-4 pt-6 sm:pt-8">
        {/* Big scan button near top - always opens camera */}
        <button
          type="button"
          onClick={() => {
            if (tokenBalance < 1) { onOutOfTokens(); return; }
            onOpenCamera();
          }}
          disabled={loading}
          className="flex w-full max-w-[360px] lg:max-w-[440px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-4 sm:px-6 py-4 text-white shadow-lg transition-all active:scale-[0.98] hover:bg-[#0a6fd4] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 animate-spin" />
          ) : (
            <Camera className="h-8 w-8 sm:h-9 sm:w-9" />
          )}
          <span className="text-lg sm:text-xl font-bold uppercase tracking-[0.08em] whitespace-nowrap">
            ESCANEAR MANCHA
          </span>
          <span className="text-[11px] font-medium text-white/80">
            Hecha la foto de tu mancha
          </span>
        </button>

        {/* Photo preview appears below the button */}
        {hasImage && imagePreview ? (
          <div className="flex w-full max-w-[360px] justify-center mt-4 sm:mt-5">
          <div className="relative" style={{ width: '88px', height: '88px' }}>
            <img
              src={imagePreview}
              alt="Mancha seleccionada"
              className="rounded-lg border border-gray-200"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <button
              type="button"
              onClick={onRemovePhoto}
              aria-label="Quitar foto"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          </div>
        ) : null}

        <div className="w-full max-w-[360px] lg:max-w-[440px] mt-8 sm:mt-10">
          <label className="mb-1.5 block text-xs font-semibold text-black">
            Dinos qué mancha es para mayor precisión
          </label>
          <input
            type="text"
            value={stainNote}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Dinos qué mancha es para mayor precisión"
            className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-center text-sm font-medium text-black outline-none transition-colors placeholder:text-center placeholder:text-gray-700 focus:border-[#087ff5]"
          />
        </div>
      </div>

      {/* Bottom blue label - becomes the analyze button when photo is taken */}
      <div className="flex flex-1" />
      <div className="w-full px-3 sm:px-4 pb-5 sm:pb-6">
        <button
          type="button"
          onClick={() => {
            if (!hasImage) return;
            if (tokenBalance < 1) { onOutOfTokens(); return; }
            onRunAnalysis();
          }}
          disabled={!hasImage || loading}
          className={`mx-auto flex max-w-[340px] w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-center transition-all active:scale-[0.98] ${
            hasImage
              ? "bg-[#087ff5] hover:bg-[#0770d8] shadow-lg cursor-pointer"
              : "bg-[#087ff5] cursor-default"
          }`}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : null}
          <p className="text-base font-bold text-white">
            ESCANEAR MANCHA
          </p>
        </button>
      </div>

    </section>
  );
}

/* ---------- Analysis Text Renderer ---------- */

type AnalysisTextProps = { text: string };

const STEP_RE = /^\s*PASO\s+(\d+)\s+(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*:\s*(.*)$/u;
const BULLET_RE = /^\s*[-•·▪◦*]\s+(.*)$/;

function AnalysisText({ text }: AnalysisTextProps) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraphs: string[] = [];
  let bulletItems: string[] = [];

  const flushParagraphs = () => {
    if (paragraphs.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-black">
          {paragraphs.join("\n")}
        </p>,
      );
      paragraphs = [];
    }
  };

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="space-y-1.5 pl-5 text-sm font-medium leading-relaxed text-black list-disc">
          {bulletItems.map((item, i) => (
            <li key={i} className="pl-1">{item}</li>
          ))}
        </ul>,
      );
      bulletItems = [];
    }
  };

  for (const line of lines) {
    const stepMatch = line.match(STEP_RE);
    const bulletMatch = line.match(BULLET_RE);
    if (stepMatch) {
      flushParagraphs();
      flushBullets();
      blocks.push(
        <div key={`step-${blocks.length}`} className="space-y-1.5">
          <h3 className="text-lg font-bold uppercase tracking-wide text-[#087ff5]">
            {`PASO ${stepMatch[1]} ${stepMatch[2]}:`}
          </h3>
          <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-black">
            {stepMatch[3]}
          </p>
        </div>,
      );
    } else if (bulletMatch) {
      flushParagraphs();
      bulletItems.push(bulletMatch[1]);
    } else if (line.trim() === "") {
      flushParagraphs();
      flushBullets();
    } else {
      flushBullets();
      paragraphs.push(line);
    }
  }
  flushParagraphs();
  flushBullets();

  return <div className="space-y-3">{blocks}</div>;
}

/* ---------- Result Page ---------- */

type ResultPageProps = {
  analysis: string;
  chatHistory: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  chatPhotoPreview: string | null;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  fromHistory: boolean;
  tokenBalance: number;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
  onOpenChatCamera: () => void;
  onRemoveChatPhoto: () => void;
  onReset: () => void;
  onOpenDrawer: () => void;
  onOpenWallet: () => void;
  onOutOfTokens: () => void;
  isLoggedIn: boolean;
  onOpenProfile: () => void;
};

function ResultPage({
  analysis,
  chatHistory,
  chatInput,
  chatLoading,
  chatPhotoPreview,
  chatScrollRef,
  fromHistory,
  tokenBalance,
  onChatInputChange,
  onSendChat,
  onOpenChatCamera,
  onRemoveChatPhoto,
  onReset,
  onOpenDrawer,
  onOpenWallet,
  onOutOfTokens,
  isLoggedIn,
  onOpenProfile,
}: ResultPageProps) {
  const marker = "ADVERTENCIA CRÍTICA:";
  const idx = analysis.indexOf(marker);
  const main = idx === -1 ? analysis : analysis.slice(0, idx).trim();
  const warning = idx === -1 ? null : analysis.slice(idx).trim();

  return (
    <section className="animate-results flex w-full flex-1 flex-col overflow-hidden px-1 sm:px-2">
      <div className="w-full flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

        </div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-[-0.5px] text-black">Resultado</h1>
        <div className="flex items-center gap-2 mr-1">
          <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
        </div>
      </div>

      <div ref={chatScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 lg:px-8 pb-6 leading-relaxed">
        {main && <AnalysisText text={main} />}

        {warning && (
          <div className="mt-6 rounded-xl border-2 border-[#ff2d2d] bg-[#ffdede] px-3 py-2">
            <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-black">
              {warning}
            </p>
          </div>
        )}

        {chatHistory.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="mt-6 flex w-full justify-end">
              <p className="whitespace-pre-wrap text-base font-medium font-sans leading-relaxed text-black text-right">
                {msg.text}
              </p>
            </div>
          ) : (
            <div key={i} className="mt-3">
              <AnalysisText text={msg.text} />
            </div>
          ),
        )}

        {chatLoading && (
          <div className="mt-3 flex items-center gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#087ff5]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#087ff5] [animation-delay:0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#087ff5] [animation-delay:0.3s]" />
          </div>
        )}

        {chatHistory.length === 0 && (
          <p className="mt-6 text-xs font-bold text-black">
            ¿Tu mancha se resiste o quieres preguntarle algo a la IA?
          </p>
        )}

        {chatPhotoPreview && (
          <div className="relative inline-block mt-3 mb-1">
            <img
              src={chatPhotoPreview}
              alt="Foto del chat"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={onRemoveChatPhoto}
              aria-label="Quitar foto del chat"
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        <div className="flex w-full items-center gap-2 mt-3 px-1 py-1.5">
          <button
            type="button"
            onClick={onOpenChatCamera}
            disabled={chatLoading}
            aria-label="Adjuntar foto"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-black transition-colors hover:bg-[#e5e7eb] active:scale-[0.9] disabled:opacity-40"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={chatInput}
            onChange={(event) => onChatInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (tokenBalance < 1) { onOutOfTokens(); return; }
                onSendChat();
              }
            }}
            placeholder="Escríbele a la IA..."
            className="h-11 min-w-0 flex-1 rounded-full border border-[#e5e7eb] bg-white px-4 text-sm font-medium font-sans text-black outline-none transition-colors placeholder:text-gray-700 focus:border-[#087ff5]"
          />
          <button
            type="button"
            onClick={() => {
              if (tokenBalance < 1) { onOutOfTokens(); return; }
              onSendChat();
            }}
            disabled={tokenBalance >= 1 && (chatLoading || (!chatInput.trim() && !chatPhotoPreview))}
            aria-label="Enviar mensaje"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_14px_rgba(8,127,245,0.4)] transition-all active:scale-[0.9] bg-[#087ff5] hover:bg-[#0a6fd4] disabled:opacity-40"
          >
            {chatLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(analysis)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-bold text-white shadow-[0_4px_14px_rgba(37,211,102,0.4)] transition-all hover:bg-[#1eb558] active:scale-[0.98]"
        >
          <Share2 className="h-5 w-5" />
          Compartir en WhatsApp
        </a>

        <button
          type="button"
          onClick={onReset}
          className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#087ff5] text-sm font-bold uppercase tracking-wide text-white shadow-[0_4px_14px_rgba(8,127,245,0.35)] transition-all hover:bg-[#0a6fd4] active:scale-[0.98]"
        >
          <ArrowLeft className="h-5 w-5" />
          {fromHistory ? "Inicio" : "Escanear otra mancha"}
        </button>
      </div>
    </section>
  );
}

/* ---------- Botiquin Page (product catalog) ---------- */

type BotiquinPageProps = {
  onOpenDrawer: () => void;
  onOpenWallet: () => void;
  onAskAI: (productName: string) => void;
  tokenBalance: number;
};

type FilterCategory = "todos" | ProductCategory;

function BotiquinPage({ onOpenDrawer, onOpenWallet, onAskAI, tokenBalance }: BotiquinPageProps) {
  const [filter, setFilter] = useState<FilterCategory>("todos");

  const filtered = filter === "todos" ? PRODUCTS : PRODUCTS.filter((p) => p.category === filter);

  return (
    <section className="flex w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-white pb-2">
        <div className="w-full flex justify-between items-center pt-1 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>

          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-[-0.5px] text-black">Botiquín</h1>
          <div className="flex items-center gap-2 mr-1">
            <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pb-1">
          {[
            { id: "todos" as const, label: "Todos" },
            ...PRODUCT_CATEGORIES,
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex h-9 sm:h-11 items-center rounded-full px-3 sm:px-5 text-xs sm:text-sm font-bold uppercase tracking-wide transition-all active:scale-95 ${
                filter === f.id
                  ? "bg-[#087ff5] text-white shadow-[0_2px_8px_rgba(8,127,245,0.3)]"
                  : "border border-[#e5e7eb] bg-white text-black hover:bg-[#f3f4f6]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {filtered.map((product) => (
          <div
            key={product.id}
            className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white p-3 transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
          >
            <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#f9fafb] to-[#f3f4f6]">
              <img
                src={product.imageUrl}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-contain p-2"
              />
            </div>
            <h3 className="mt-2 text-sm font-bold text-black leading-tight">{product.name}</h3>
            <span className="mt-1 inline-block w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
              {product.material}
            </span>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-gray-500 line-clamp-2">
              {product.description}
            </p>
            <div className="mt-auto pt-3">
              <a
                href={product.amazonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#087ff5] text-[11px] font-bold uppercase tracking-wide text-white transition-all hover:bg-[#0a6fd4] active:scale-95"
              >
                <Store className="h-3.5 w-3.5" />
                Ver en Amazon
              </a>
              <button
                type="button"
                onClick={() => onAskAI(product.name)}
                className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white text-[10px] font-bold uppercase tracking-wide text-[#087ff5] transition-all hover:bg-blue-50 active:scale-95"
              >
                <MessageCircle className="h-3 w-3" />
                Preguntar a IA
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[10px] font-medium leading-relaxed text-gray-400">
        Nota legal: Algunos enlaces de esta sección pueden generar ingresos para snapcleAIn a través del programa de afiliados de Amazon de forma segura.
      </p>
    </section>
  );
}

/* ---------- Premium Page (subscription shop) ---------- */

type PremiumPageProps = {
  onOpenDrawer: () => void;
  onOpenWallet: () => void;
  tokenBalance: number;
  adLoading: boolean;
  onWatchAd: () => void;
};

function PremiumPage({ onOpenDrawer, onOpenWallet, tokenBalance, adLoading, onWatchAd }: PremiumPageProps) {
  const [checkoutPlan, setCheckoutPlan] = useState<{ name: string; price: string } | null>(null);

  return (
    <section className="flex w-full flex-1 flex-col overflow-y-auto px-1 sm:px-0">
      <div className="w-full flex justify-between items-center mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

        </div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-[-0.5px] text-black">Premium</h1>
        <div className="flex items-center gap-2 mr-1">
          <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border-2 p-4 ${plan.accent} ${plan.highlight ? "ring-2 ring-amber-300" : ""}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {plan.icon}
                <h3 className="text-base font-bold text-black">{plan.name}</h3>
                {plan.highlight && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Popular
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl font-extrabold text-black">{plan.price}</span>
                <span className="text-sm font-bold text-gray-500">€/mes</span>
              </div>
            </div>
            <ul className="space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm font-medium text-black">
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            {plan.isFree ? (
              <div className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-gray-100 text-sm font-bold uppercase tracking-wide text-gray-500">
                Plan actual
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCheckoutPlan({ name: plan.name, price: plan.price })}
                className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                  plan.highlight
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-blue-600 text-white hover:bg-[#0a6fd4]"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                Suscribirme ahora
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-black">Ver Anuncio</p>
              <p className="text-xs font-medium text-amber-600">Gana +0,25 créditos gratis (carga 3s)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onWatchAd}
            disabled={adLoading}
            className="flex h-10 items-center justify-center rounded-xl bg-amber-500 px-5 text-xs font-bold uppercase text-white transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50"
          >
            {adLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Ver"}
          </button>
        </div>
      </div>

      {checkoutPlan && (
        <StripeCheckoutCard
          planName={checkoutPlan.name}
          planPrice={checkoutPlan.price}
          onClose={() => setCheckoutPlan(null)}
        />
      )}
    </section>
  );
}

/* ---------- Desktop Sidebar ---------- */

type DesktopSidebarProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isLoggedIn: boolean;
  loggedInEmail: string;
  tokenBalance: number;
  onOpenWallet: () => void;
  onOpenLogin: () => void;
  onOpenProfile: () => void;
  onOpenAbout: () => void;
  onOpenHistory: () => void;
  onLogout: () => void;
};

function DesktopSidebar({
  activeTab,
  onTabChange,
  isLoggedIn,
  loggedInEmail,
  tokenBalance,
  onOpenWallet,
  onOpenLogin,
  onOpenProfile,
  onOpenAbout,
  onOpenHistory,
  onLogout,
}: DesktopSidebarProps) {
  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "inicio", label: "Inicio", icon: <Home className="h-5 w-5" /> },
    { id: "escanear", label: "Escanear", icon: <Camera className="h-5 w-5" /> },
    { id: "biblioteca", label: "Biblioteca", icon: <BookOpen className="h-5 w-5" /> },
    { id: "botiquin", label: "Botiquín", icon: <Package className="h-5 w-5" /> },
    { id: "premium", label: "Premium", icon: <Crown className="h-5 w-5" /> },
  ];

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-[#e5e7eb] bg-white p-4">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 py-3 mb-4">
        <SnapLogo className="h-9 w-9" />
        <span className="font-brand text-lg font-extrabold tracking-tight text-black">
          snapcle<span className="text-[#087ff5]">AI</span>n
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-blue-50 text-[#087ff5]"
                  : "text-gray-600 hover:bg-[#f3f4f6]"
              }`}
            >
              <span className={active ? "text-[#087ff5]" : "text-gray-400"}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Secondary actions */}
      <div className="mt-4 flex flex-col gap-1 border-t border-[#e5e7eb] pt-4">
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#f3f4f6]"
        >
          <Clock className="h-5 w-5 text-gray-400" />
          Mi Historial
        </button>
        <button
          type="button"
          onClick={onOpenAbout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-[#f3f4f6]"
        >
          <Info className="h-5 w-5 text-gray-400" />
          Acerca de
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Wallet + User section */}
      <div className="border-t border-[#e5e7eb] pt-4 space-y-3">
        <button
          type="button"
          onClick={onOpenWallet}
          className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 transition-colors hover:bg-amber-100"
        >
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-700">Tokens</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-extrabold text-amber-700 tabular-nums">{tokenBalance.toFixed(2)}</span>
            <Gem className="h-3.5 w-3.5 text-amber-500" />
          </div>
        </button>

        {isLoggedIn ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex w-full items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2.5 text-left transition-colors hover:bg-[#f3f4f6]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <span className="truncate text-xs font-semibold text-black">{loggedInEmail}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-500 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#087ff5] px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0a6fd4]"
          >
            <LogIn className="h-4 w-4" />
            Iniciar sesión
          </button>
        )}
      </div>
    </aside>
  );
}

/* ---------- Bottom Tab Bar ---------- */

type TabBarProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const sideTabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "inicio", label: "Inicio", icon: <Home className="h-5 w-5" /> },
    { id: "biblioteca", label: "Biblioteca", icon: <BookOpen className="h-5 w-5" /> },
  ];
  const rightTabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "botiquin", label: "Botiquín", icon: <Package className="h-5 w-5" /> },
    { id: "premium", label: "Premium", icon: <Crown className="h-5 w-5" /> },
  ];

  const renderTab = (tab: { id: Tab; label: string; icon: React.ReactNode }) => {
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
          active ? "text-[#087ff5]" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <span className={`transition-transform ${active ? "scale-110" : "scale-100"}`}>
          {tab.icon}
        </span>
        <span className="text-[9px] font-semibold leading-none tracking-wide">{tab.label}</span>
      </button>
    );
  };

  return (
    <nav className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 z-50 flex items-center justify-around rounded-2xl border border-[#e5e7eb] bg-white px-2 py-2 shadow-lg">
      {sideTabs.map(renderTab)}
      <button
        key="escanear"
        type="button"
        onClick={() => onTabChange("escanear")}
        className="flex flex-col items-center justify-center gap-0.5"
      >
        <span className={`flex h-9 w-9 -mt-6 items-center justify-center rounded-full shadow-md transition-all border-2 border-white ${
          activeTab === "escanear"
            ? "bg-[#087ff5] text-white scale-110 shadow-[0_2px_10px_rgba(8,127,245,0.5)]"
            : "bg-[#087ff5] text-white hover:scale-105 shadow-[0_2px_8px_rgba(8,127,245,0.4)]"
        }`}>
          <Camera className="h-4 w-4" />
        </span>
        <span className={`text-[9px] font-semibold leading-none tracking-wide ${activeTab === "escanear" ? "text-[#087ff5]" : "text-gray-400"}`}>Escanear</span>
      </button>
      {rightTabs.map(renderTab)}
    </nav>
  );
}

/* ---------- Main App ---------- */

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("inicio");
  const [view, setView] = useState<View>("scan");
  const [drawerPanel, setDrawerPanel] = useState<DrawerPanel>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stainNote, setStainNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatPhoto, setChatPhoto] = useState<File | null>(null);
  const [chatPhotoPreview, setChatPhotoPreview] = useState<string | null>(null);
  const [history, setHistory] = useState<StainRecord[]>(() => loadHistory());
  const [fromHistory, setFromHistory] = useState(false);
  const [aboutMessages, setAboutMessages] = useState<ChatMessage[]>([]);
  const [aboutInput, setAboutInput] = useState("");
  const [aboutLoading, setAboutLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(() => loadTokenBalance());
  const [adLoading, setAdLoading] = useState(false);
  const [showOutOfTokens, setShowOutOfTokens] = useState(false);
  const [showTokenToast, setShowTokenToast] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loggedInEmail, setLoggedInEmail] = useState("");
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [registeredAccounts, setRegisteredAccounts] = useState<Account[]>(() => loadAccounts());

  useEffect(() => {
    if (tokenBalance < 1) {
      setShowTokenToast(true);
      const timer = setTimeout(() => setShowTokenToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [tokenBalance]);

  useEffect(() => {
    const checkSundayRefill = () => {
      if (new Date().getDay() !== 0) return;
      const lastRefill = getLastRefill(loggedInEmail || null);
      const thisSunday = getStartOfCurrentSunday();
      const thisSundayIso = thisSunday.toISOString();
      if (!lastRefill || new Date(lastRefill) < thisSunday) {
        setTokenBalance((prev) => {
          const next = +(prev + 1).toFixed(2);
          saveTokenBalance(next, loggedInEmail || null);
          return next;
        });
        saveLastRefill(thisSundayIso, loggedInEmail || null);
      }
    };
    checkSundayRefill();
    const interval = setInterval(checkSundayRefill, 60 * 1000);
    return () => clearInterval(interval);
  }, [loggedInEmail]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatCameraRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecciona una imagen.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("La imagen no puede superar los 10 MB.");
      return;
    }
    setError(null);
    setAnalysis(null);
    setImagePreview(URL.createObjectURL(file));
    setSelectedFile(file);
  }, []);

  const openCamera = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openChatCamera = useCallback(() => {
    chatCameraRef.current?.click();
  }, []);

  const handleChatPhoto = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecciona una imagen.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("La imagen no puede superar los 10 MB.");
      return;
    }
    setError(null);
    setChatPhotoPreview(URL.createObjectURL(file));
    setChatPhoto(file);
  }, []);

  const removeChatPhoto = useCallback(() => {
    setChatPhoto(null);
    setChatPhotoPreview(null);
    if (chatCameraRef.current) chatCameraRef.current.value = "";
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!selectedFile) {
      setError("Primero escanea o sube una foto de la mancha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeWithGemini(selectedFile, stainNote);
      setAnalysis(result);

      let dataUrl = imagePreview;
      try {
        dataUrl = await fileToDataURL(selectedFile);
      } catch {
        // keep object URL fallback
      }
      const record: StainRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        image: dataUrl ?? "",
        note: stainNote || "Mancha sin nombre",
        analysis: result,
        date: new Date().toISOString(),
      };
      const updated = [record, ...history].slice(0, 50);
      setHistory(updated);
      saveHistory(updated);

      setTokenBalance((prev) => {
        const next = Math.max(0, +(prev - 1.0).toFixed(1));
        saveTokenBalance(next, loggedInEmail || null);
        return next;
      });

      setView("result");
      setFromHistory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar la imagen.");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, stainNote, imagePreview, history, loggedInEmail]);

  const sendChat = useCallback(async () => {
    const question = chatInput.trim();
    if ((!question && !chatPhoto) || !analysis || chatLoading) return;
    setChatInput("");
    const photo = chatPhoto;
    removeChatPhoto();
    const userMsg: ChatMessage = {
      role: "user",
      text: photo ? `${question || "Mira cómo ha quedado tras limpiarla."} [Foto adjunta]` : question,
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const answer = await askFollowUp(analysis, [...chatHistory, userMsg], question, photo ?? undefined);
      setChatHistory((prev) => [...prev, { role: "model", text: answer }]);
      setTokenBalance((prev) => {
        const next = Math.max(0, +(prev - 1.0).toFixed(1));
        saveTokenBalance(next, loggedInEmail || null);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la pregunta.");
    } finally {
      setChatLoading(false);
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [chatInput, chatPhoto, analysis, chatLoading, chatHistory, removeChatPhoto, loggedInEmail]);

  const resetAll = useCallback(() => {
    setView("scan");
    setImagePreview(null);
    setSelectedFile(null);
    setAnalysis(null);
    setError(null);
    setChatHistory([]);
    setChatInput("");
    setFromHistory(false);
    removeChatPhoto();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [removeChatPhoto]);

  const loadFromHistory = useCallback((record: StainRecord) => {
    setAnalysis(record.analysis);
    setImagePreview(record.image || null);
    setSelectedFile(null);
    setStainNote(record.note);
    setChatHistory([]);
    setError(null);
    setFromHistory(true);
    setView("result");
    setDrawerPanel(null);
    setActiveTab("escanear");
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const sendAbout = useCallback(async () => {
    const question = aboutInput.trim();
    if (!question || aboutLoading) return;
    setAboutInput("");
    const userMsg: ChatMessage = { role: "user", text: question };
    setAboutMessages((prev) => [...prev, userMsg]);
    setAboutLoading(true);
    try {
      const answer = await askAbout([...aboutMessages, userMsg], question);
      setAboutMessages((prev) => [...prev, { role: "model", text: answer }]);
    } catch {
      setAboutMessages((prev) => [...prev, { role: "model", text: "Lo siento, no pude responder en este momento. Inténtalo de nuevo en unos segundos." }]);
    } finally {
      setAboutLoading(false);
    }
  }, [aboutInput, aboutLoading, aboutMessages]);

  const openDrawer = useCallback(() => setDrawerPanel("menu"), []);
  const closeDrawer = useCallback(() => setDrawerPanel(null), []);
  const openWallet = useCallback(() => setDrawerPanel("wallet"), []);
  const outOfTokens = useCallback(() => setShowOutOfTokens(true), []);

  const watchAd = useCallback(() => {
    setAdLoading(true);
    setTimeout(() => {
      setTokenBalance((prev) => {
        const next = +(prev + 0.25).toFixed(2);
        saveTokenBalance(next, loggedInEmail || null);
        return next;
      });
      setAdLoading(false);
    }, 3000);
  }, [loggedInEmail]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === "escanear") setView("scan");
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f5f7] overflow-hidden sm:py-4">
      <div className="w-full h-[100dvh] lg:h-[min(100dvh-2rem,920px)] lg:max-w-[1200px] bg-white sm:rounded-3xl shadow-xl flex mx-auto relative overflow-hidden">
        {/* Desktop sidebar */}
        <DesktopSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isLoggedIn={isLoggedIn}
          loggedInEmail={loggedInEmail}
          tokenBalance={tokenBalance}
          onOpenWallet={openWallet}
          onOpenLogin={() => setDrawerPanel("login")}
          onOpenProfile={() => setShowProfilePanel(true)}
          onOpenAbout={() => {
            if (aboutMessages.length === 0) {
              setAboutMessages([
                {
                  role: "model",
                  text: "¡Hola! Soy snapcleAIn, tu Inteligencia Artificial experta en limpieza. Mi funcion es simple: haces una foto a cualquier mancha y yo te doy el manual exacto, paso a paso, para eliminarla.\n\nFunciono con tokens: cada analisis o pregunta cuesta 1 token entero. Empiezas con 3 tokens de regalo. Cuando te quedes sin tokens, puedes ver un anuncio para ganar 0,25 tokens o suscribirte a un plan mensual con tokens automaticos.\n\nPuedes preguntarme cualquier cosa sobre limpieza, manchas o productos. Estoy aqui para ayudarte.",
                },
              ]);
            }
            setDrawerPanel("about");
          }}
          onOpenHistory={() => setDrawerPanel("history")}
          onLogout={() => {
            setIsLoggedIn(false);
            setLoggedInEmail("");
            setTokenBalance(loadTokenBalance(null));
            setShowProfilePanel(false);
          }}
        />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-5 lg:p-6 pb-20 lg:pb-6">
        <div className="flex-1 flex flex-col min-h-0">
          {activeTab === "inicio" && (
            <InicioPage
              onEnter={() => setActiveTab("escanear")}
              onOpenAbout={() => {
                if (aboutMessages.length === 0) {
                  setAboutMessages([
                    {
                      role: "model",
                      text: "¡Hola! Soy snapcleAIn, tu Inteligencia Artificial experta en limpieza. Mi funcion es simple: haces una foto a cualquier mancha y yo te doy el manual exacto, paso a paso, para eliminarla.\n\nFunciono con tokens: cada analisis o pregunta cuesta 1 token entero. Empiezas con 3 tokens de regalo. Cuando te quedes sin tokens, puedes ver un anuncio para ganar 0,25 tokens o suscribirte a un plan mensual con tokens automaticos.\n\nPuedes preguntarme cualquier cosa sobre limpieza, manchas o productos. Estoy aqui para ayudarte.",
                    },
                  ]);
                }
                setDrawerPanel("about");
              }}
              onOpenDrawer={openDrawer}
              isLoggedIn={isLoggedIn}
              onOpenProfile={() => setShowProfilePanel(true)}
              onOpenLogin={() => setDrawerPanel("login")}
            />
          )}

          {activeTab === "biblioteca" && (
            <BibliotecaPage
              onOpenDrawer={openDrawer}
              onOpenWallet={openWallet}
              tokenBalance={tokenBalance}
            />
          )}

          {activeTab === "escanear" && view === "scan" && (
            <ScanPage
              stainNote={stainNote}
              loading={loading}
              hasImage={Boolean(selectedFile)}
              imagePreview={imagePreview}
              tokenBalance={tokenBalance}
              onNoteChange={setStainNote}
              onOpenCamera={openCamera}
              onRunAnalysis={runAnalysis}
              onRemovePhoto={resetAll}
              onOpenDrawer={openDrawer}
              onOpenWallet={openWallet}
              onOutOfTokens={outOfTokens}
              isLoggedIn={isLoggedIn}
              onOpenProfile={() => setShowProfilePanel(true)}
              onOpenLogin={() => setDrawerPanel("login")}
            />
          )}

          {activeTab === "escanear" && view === "result" && analysis && (
            <ResultPage
              analysis={analysis}
              chatHistory={chatHistory}
              chatInput={chatInput}
              chatLoading={chatLoading}
              chatPhotoPreview={chatPhotoPreview}
              chatScrollRef={chatScrollRef}
              fromHistory={fromHistory}
              tokenBalance={tokenBalance}
              onChatInputChange={setChatInput}
              onSendChat={sendChat}
              onOpenChatCamera={openChatCamera}
              onRemoveChatPhoto={removeChatPhoto}
              onReset={resetAll}
              onOpenDrawer={openDrawer}
              onOpenWallet={openWallet}
              onOutOfTokens={outOfTokens}
              isLoggedIn={isLoggedIn}
              onOpenProfile={() => setShowProfilePanel(true)}
            />
          )}

          {activeTab === "botiquin" && (
            <BotiquinPage
              onOpenDrawer={openDrawer}
              onOpenWallet={openWallet}
              onAskAI={(productName) => {
                if (aboutMessages.length === 0) {
                  setAboutMessages([
                    {
                      role: "model",
                      text: "¡Hola! Soy snapcleAIn, tu Inteligencia Artificial experta en limpieza. Puedes preguntarme sobre cualquier producto, mancha o técnica de limpieza. Estoy aquí para ayudarte.",
                    },
                  ]);
                }
                setAboutInput(`¿Cómo uso ${productName} para quitar manchas?`);
                setDrawerPanel("about");
              }}
              tokenBalance={tokenBalance}
            />
          )}

          {activeTab === "premium" && (
            <PremiumPage
              onOpenDrawer={openDrawer}
              onOpenWallet={openWallet}
              tokenBalance={tokenBalance}
              adLoading={adLoading}
              onWatchAd={watchAd}
            />
          )}
        </div>

        {/* Bottom tab bar - mobile only */}
        <div className="lg:hidden">
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <input
          ref={chatCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleChatPhoto(file);
          }}
        />

        {/* Error */}
        {error && (
          <div className="absolute bottom-16 left-3 right-3 sm:bottom-20 lg:bottom-6 lg:left-6 lg:right-6 sm:left-5 sm:right-5 z-40 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 animate-fade-in">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Overlays */}
        {showOutOfTokens && (
          <OutOfTokensAlert
            adLoading={adLoading}
            onClose={() => setShowOutOfTokens(false)}
            onWatchAd={() => {
              watchAd();
              setShowOutOfTokens(false);
            }}
            onOpenPlans={() => {
              setShowOutOfTokens(false);
              setActiveTab("premium");
            }}
          />
        )}

        {drawerPanel === "menu" && (
          <DrawerMenu
            onClose={closeDrawer}
            onSelect={(panel) => {
              if (panel === "plans") {
                closeDrawer();
                setActiveTab("premium");
              } else {
                setDrawerPanel(panel);
              }
            }}
          />
        )}
        {drawerPanel === "login" && (
          <LoginCard
            onClose={closeDrawer}
            onSuccess={(em) => { setIsLoggedIn(true); setLoggedInEmail(em); setTokenBalance(loadTokenBalance(em)); closeDrawer(); }}
            accounts={registeredAccounts}
            onRegister={(acc) => {
              const updated = [...registeredAccounts, acc];
              setRegisteredAccounts(updated);
              saveAccounts(updated);
            }}
          />
        )}
        {drawerPanel === "history" && (
          <HistoryPanel
            history={history}
            onClose={closeDrawer}
            onLoad={loadFromHistory}
            onDelete={deleteRecord}
          />
        )}
        {drawerPanel === "about" && (
          <AboutPanel
            messages={aboutMessages}
            input={aboutInput}
            loading={aboutLoading}
            onInputChange={setAboutInput}
            onSend={sendAbout}
            onClose={closeDrawer}
          />
        )}
        {drawerPanel === "wallet" && (
          <WalletShopCard
            balance={tokenBalance}
            adLoading={adLoading}
            onClose={closeDrawer}
            onWatchAd={watchAd}
          />
        )}

        {showProfilePanel && isLoggedIn && (
          <div className="absolute inset-0 z-[70] flex" onClick={() => setShowProfilePanel(false)}>
            <div
              className="flex h-full w-[280px] max-w-[80%] flex-col bg-white p-4 sm:p-5 animate-slide-in-right shadow-2xl ml-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-[#087ff5]" />
                  <h2 className="text-lg font-bold text-black">Perfil</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfilePanel(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
                  aria-label="Cerrar perfil"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <User className="h-8 w-8 text-blue-600" />
                </div>
                <p className="text-sm font-bold text-black">{loggedInEmail}</p>
              </div>

              <div className="space-y-3 flex-1">
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Plan actual</p>
                  <p className="text-sm font-bold text-black">Gratuito</p>
                  <p className="text-xs font-medium text-gray-500 mt-1">3 tokens iniciales + 1 token cada domingo</p>
                </div>
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Tokens disponibles</p>
                  <p className="text-sm font-bold text-amber-600">{tokenBalance.toFixed(2)} tokens</p>
                </div>
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Análisis guardados</p>
                  <p className="text-sm font-bold text-black">{history.length} manchas</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsLoggedIn(false);
                  setLoggedInEmail("");
                  setTokenBalance(loadTokenBalance(null));
                  setShowProfilePanel(false);
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-red-600 active:scale-[0.98]"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        )}

        {showTokenToast && (
          <div className="absolute left-1/2 top-3 z-[80] -translate-x-1/2 animate-fade-in">
            <div className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 shadow-lg">
              <AlertTriangle className="h-4 w-4 text-white" />
              <span className="text-xs font-bold text-white">Te has quedado sin tokens</span>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default App;
