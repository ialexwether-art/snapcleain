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
  RefreshCw,
  ScanLine,
  Share2,
  Shield,
  Sparkles,
  Star,
  Store,
  Smartphone,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { analyzeWithGemini } from "@/lib/geminiAnalyzer";
import { supabase } from "@/lib/supabaseClient";
import { showRewardedAd } from "@/lib/admobRewarded";

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

type SubscriptionPlan = {
  name: string;
  price: string;
  priceId: string;
  planKey: string;
  mode: "payment" | "subscription";
  icon: React.ReactNode;
  features: string[];
  accent: string;
  highlight?: boolean;
  isFree?: boolean;
};

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    name: "Gratuito",
    price: "0",
    priceId: "",
    planKey: "gratuito",
    mode: "subscription" as const,
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
    priceId: "",
    planKey: "aficionado",
    mode: "subscription" as const,
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
    priceId: "",
    planKey: "limpieza_total",
    mode: "subscription" as const,
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

type PriceMap = Record<string, string>;

type StripePrice = {
  id: string;
  product_id: string;
  product_name: string | null;
  unit_amount: number | null;
  currency: string;
  interval: string | null;
  interval_count: number | null;
  active: boolean;
};

async function fetchStripePriceMap(): Promise<PriceMap> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-prices-sync`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return {};
    const data = await res.json();
    return (data?.mapping ?? {}) as PriceMap;
  } catch {
    return {};
  }
}

function useStripePriceMap(): { priceMap: PriceMap; loading: boolean; refresh: () => Promise<void> } {
  const [priceMap, setPriceMap] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const map = await fetchStripePriceMap();
    setPriceMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { priceMap, loading, refresh };
}

/* ---------- Stripe Checkout Card ---------- */

type StripeCheckoutCardProps = {
  planName: string;
  planPrice: string;
  priceId: string;
  mode: "payment" | "subscription";
  userEmail: string | null;
  onClose: () => void;
};

function StripeCheckoutCard({ planName, planPrice, priceId, mode, userEmail, onClose }: StripeCheckoutCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (!userEmail) {
      setError("Necesitas iniciar sesión para suscribirte.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const checkoutUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;
      const res = await fetch(checkoutUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          price_id: priceId,
          mode,
          email: userEmail,
          success_url: `${window.location.origin}?checkout=success`,
          cancel_url: `${window.location.origin}?checkout=cancelled`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo iniciar el pago.");
      }
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Stripe no devolvió una URL de pago.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar con Stripe.");
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] rounded-3xl bg-white p-6 shadow-2xl animate-pop-in"
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

        <div className="space-y-3">
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 text-center">
            <Shield className="mx-auto mb-2 h-8 w-8 text-[#635bff]" />
            <p className="text-sm font-semibold text-black">Serás redirigido a Stripe</p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Pago seguro alojado por Stripe. No almacenamos datos de tarjeta.
            </p>
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 animate-fade-in">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#635bff] text-sm font-bold uppercase tracking-wide text-white shadow-md transition-all hover:bg-[#5851eb] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Redirigiendo...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Pagar {planPrice}€/mes
              </>
            )}
          </button>
          <p className="flex items-center justify-center gap-1 text-center text-xs font-medium text-gray-400">
            <Lock className="h-3 w-3" />
            Pago seguro cifrado con Stripe
          </p>
        </div>
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
      className="absolute inset-0 z-[75] flex items-center justify-center bg-black/50 px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[300px] rounded-3xl bg-white p-6 shadow-2xl animate-pop-in"
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
  userEmail: string | null;
  priceMap: PriceMap;
  onClose: () => void;
  onWatchAd: () => void;
  onRequireLogin: () => void;
  onOpenSync: () => void;
};

function WalletShopCard({ balance, adLoading, userEmail, priceMap, onClose, onWatchAd, onRequireLogin, onOpenSync }: WalletShopCardProps) {
  const [checkoutPlan, setCheckoutPlan] = useState<{ name: string; price: string; priceId: string; mode: "payment" | "subscription" } | null>(null);

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (!userEmail) {
      onRequireLogin();
      return;
    }
    const resolvedPriceId = plan.planKey ? (priceMap[plan.planKey] ?? "") : plan.priceId;
    if (!resolvedPriceId) {
      onOpenSync();
      return;
    }
    setCheckoutPlan({ name: plan.name, price: plan.price, priceId: resolvedPriceId, mode: plan.mode });
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] max-h-[90%] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-pop-in"
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
                  onClick={() => handleSubscribe(plan)}
                  className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                    plan.highlight
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-blue-600 text-white hover:bg-[#0a6fd4]"
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  {priceMap[plan.planKey] ? "Suscribirme ahora" : "Configurar precio"}
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
          priceId={checkoutPlan.priceId}
          mode={checkoutPlan.mode}
          userEmail={userEmail}
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
};

function LoginCard({ onClose, onSuccess }: LoginCardProps) {
  const [email, setEmail] = useState("");
  const [emailFormatError, setEmailFormatError] = useState(false);
  const [step, setStep] = useState<"email" | "password">("email");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState("");

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

  const handleContinuePassword = async () => {
    const e = email.trim();
    const pw = password;
    if (pw.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setPasswordError("");
    setAuthErrorMessage("");
    setAuthLoading(true);
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: e,
        password: pw,
      });
      if (signInError) {
        if (signInError.message.toLowerCase().includes("invalid login credentials")) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: e,
            password: pw,
          });
          if (signUpError) {
            setPasswordError(signUpError.message);
            setAuthLoading(false);
            return;
          }
          if (signUpData.user) {
            setAuthLoading(false);
            onSuccess(e);
            return;
          }
        } else {
          setPasswordError(signInError.message);
          setAuthLoading(false);
          return;
        }
      } else if (signInData.user) {
        setAuthLoading(false);
        onSuccess(e);
        return;
      }
      setAuthLoading(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Error al iniciar sesión");
      setAuthLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setPassword("");
    setPasswordError("");
    setTimeout(() => emailRef.current?.focus(), 100);
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 px-6 animate-fade-in"
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
            Introduce tu correo y contraseña. Si no tienes cuenta, se crea automáticamente.
          </p>
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
              disabled={authLoading}
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
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
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
                {passwordError}
              </p>
            )}
            <button
              type="button"
              onClick={handleContinuePassword}
              disabled={authLoading}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#087ff5] py-4 text-base font-bold text-white shadow-[0_4px_14px_rgba(8,127,245,0.4)] transition-all hover:bg-[#0a6fd4] active:scale-[0.98] disabled:opacity-50"
            >
              {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
              {authLoading ? "Cargando..." : "Continuar"}
            </button>
          </div>
        )}

        {authErrorMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{authErrorMessage}</p>
          </div>
        )}

        <p className="text-center text-xs font-medium leading-relaxed text-gray-400">
          Al continuar, aceptas nuestros Términos de Uso y reconoces haber leído nuestra Política de Privacidad.
        </p>
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
    <div className="absolute inset-0 z-[60] flex flex-col bg-white p-6 animate-slide-in">
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
    <div className="absolute inset-0 z-[60] flex flex-col bg-white p-6 animate-slide-in">
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
        className="flex h-full w-[280px] max-w-[80%] flex-col bg-white p-5 animate-slide-in shadow-2xl"
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
      className="flex h-full flex-col items-center rounded-2xl bg-[#000053] p-4 @lg:rounded-2xl @lg:p-10 relative overflow-y-auto overflow-x-hidden"
      style={splashContainerStyle}
    >
      {/* Top: menu + login (right, mobile only) */}
      <div className="flex w-full items-center justify-between pt-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 active:scale-90 @lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>

        </div>
        <button
          type="button"
          onClick={() => (isLoggedIn ? onOpenProfile() : onOpenLogin())}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-white/60 px-3 text-white transition-colors hover:bg-white/15 active:scale-95 @lg:hidden"
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

      {/* Logo */}
      <div className="flex w-full flex-1 items-center justify-center py-4">
        <img
          src="/logo_snapcleAIn_negativo_alta.jpg"
          alt="snapcleAIn"
          className="max-h-[45%] max-w-[88%] scale-[1.03] object-contain @lg:-translate-y-4 mix-blend-lighten"
        />
      </div>

      {/* CTA buttons */}
      <div className="flex w-full flex-col items-center space-y-3 pb-2 shrink-0">
        {/* MOBILE: "¿Qué hacer?" button (same width as CTA) */}
        <div className="@lg:hidden w-full max-w-[280px]">
          <button
            type="button"
            onClick={onOpenAbout}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/60 px-5 py-3 text-white transition-colors hover:bg-white/15 active:scale-95"
          >
            <HelpCircle className="h-5 w-5" />
            <span className="text-sm font-semibold">¿Qué hacer?</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onEnter}
          className="flex h-14 w-full max-w-[280px] @lg:max-w-[320px] items-center justify-center rounded-full bg-white text-base @lg:text-lg font-bold text-[#0a47a3] shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          ENTRAR A LA APP
        </button>
      </div>

      {/* Details integrated directly in the page, scrollable */}
      <div className="w-full max-w-[520px] mt-4 pb-8 shrink-0">
        <div className="space-y-4 rounded-2xl bg-white/5 p-5 text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Cómo funciona</p>
            <p className="text-sm font-medium leading-relaxed text-white/85">
              Haz una foto a cualquier mancha y la IA te dará el manual exacto, paso a paso, para eliminarla en cualquier superficie.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Cómo escanear una mancha</p>
            <ol className="space-y-1.5">
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/80">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">1</span>
                Pulsa ESCANEAR y haz una foto a la mancha.
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/80">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">2</span>
                Opcionalmente, escribe qué tipo de mancha es para mayor precisión.
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/80">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">3</span>
                Recibe la solución y haz preguntas de seguimiento si lo necesitas.
              </li>
            </ol>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">¿Qué puedes hacer?</p>
            <p className="text-sm font-medium leading-relaxed text-white/70">
              Puedes escanear manchas, consultar la biblioteca de soluciones, preguntar a la IA sobre productos de limpieza y guardar tu historial. Cada análisis o pregunta cuesta 1 token.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Biblioteca de manchas</p>
            <p className="text-sm font-medium leading-relaxed text-white/70">
              Consulta soluciones paso a paso para manchas comunes: café, vino, aceite, tinta, barro, sangre y muchas más, organizadas por tipo de superficie.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Botiquín de limpieza</p>
            <p className="text-sm font-medium leading-relaxed text-white/70">
              Guarda los productos de limpieza que tienes en casa. La IA tiene en cuenta tu botiquín para recomendarte soluciones con lo que ya tienes.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Historial</p>
            <p className="text-sm font-medium leading-relaxed text-white/70">
              Todos tus análisis se guardan automáticamente. Puedes volver a consultar cualquier mancha anterior cuando quieras.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Tokens</p>
            <p className="text-sm font-medium leading-relaxed text-white/70">
              Empiezas con 3 tokens de regalo. Cada análisis o pregunta cuesta 1 token. Cuando te quedes sin tokens, puedes ver un anuncio para ganar 0,25 tokens o suscribirte a un plan mensual.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Planes de suscripción</p>
            <p className="text-sm font-medium leading-relaxed text-white/70">
              Si necesitas más análisis, puedes suscribirte a un plan mensual para recibir tokens cada semana sin tener que ver anuncios.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/50 mb-1">Consejos de buena foto</p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/70">
                <span className="text-white/40 mt-0.5">•</span>
                Asegúrate de que haya buena luz al hacer la foto.
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/70">
                <span className="text-white/40 mt-0.5">•</span>
                Acércate a la mancha para que se vea con detalle.
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/70">
                <span className="text-white/40 mt-0.5">•</span>
                Enfoca bien la zona para que la IA pueda identificarla.
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-relaxed text-white/70">
                <span className="text-white/40 mt-0.5">•</span>
                Si la mancha está en una superficie reflectante, evita que tu propio reflejo salga en la foto.
              </li>
            </ul>
          </div>
        </div>
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
          <div className="flex items-center gap-2 @lg:hidden">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>

          </div>
          <h1 className="text-xl @lg:text-3xl font-bold tracking-[-0.5px] text-black">Biblioteca</h1>
          <div className="flex items-center gap-2 mr-1 @lg:hidden">
            <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
          </div>
        </div>

        <p className="mb-2 text-sm font-medium text-gray-500">
          Toca una mancha para ver la solución exacta paso a paso.
        </p>

      </div>

      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2.5 @lg:gap-3">
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
      {/* Top bar: menu + wallet/login (mobile only) */}
      <div className="flex w-full items-center justify-between pt-1 pb-3 @lg:hidden">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
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

      <div className="flex w-full flex-col items-center px-4 pt-8">
        {/* Big scan button near top - always opens camera */}
        <button
          type="button"
          onClick={() => {
            if (tokenBalance < 1) { onOutOfTokens(); return; }
            onOpenCamera();
          }}
          disabled={loading}
          className="flex w-full max-w-[360px] @lg:max-w-[440px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-6 py-4 text-white shadow-lg transition-all active:scale-[0.98] hover:bg-[#0a6fd4] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Camera className="h-8 w-8" />
          )}
          <span className="text-lg font-bold uppercase tracking-[0.08em] whitespace-nowrap">
            ESCANEAR MANCHA
          </span>
          <span className="text-[11px] font-medium text-white/80">
            Hecha la foto de tu mancha
          </span>
        </button>

        {/* Photo preview appears below the button */}
        {hasImage && imagePreview ? (
          <div className="flex w-full max-w-[360px] justify-center mt-5">
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

        <div className="w-full max-w-[360px] @lg:max-w-[440px] mt-10">
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
      <div className="w-full px-4 pb-6">
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
    <section className="animate-results flex w-full flex-1 flex-col overflow-hidden px-2">
      <div className="w-full flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 @lg:hidden">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

        </div>
        <h1 className="text-xl @lg:text-3xl font-bold tracking-[-0.5px] text-black">Resultado</h1>
        <div className="flex items-center gap-2 mr-1 @lg:hidden">
          <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
        </div>
      </div>

      <div ref={chatScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-6 @lg:px-8 pb-6 leading-relaxed">
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
          <div className="flex items-center gap-2 @lg:hidden">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>

          </div>
          <h1 className="text-xl @lg:text-3xl font-bold tracking-[-0.5px] text-black">Botiquín</h1>
          <div className="flex items-center gap-2 mr-1 @lg:hidden">
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
              className={`flex h-9 items-center rounded-full px-3 text-xs font-bold uppercase tracking-wide transition-all active:scale-95 ${
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

      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-2.5 @lg:gap-3">
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

/* ---------- Stripe Price Sync Panel ---------- */

type StripeSyncPanelProps = {
  priceMap: PriceMap;
  onClose: () => void;
  onSaved: () => void;
};

function formatAmount(p: { unit_amount: number | null; currency: string }): string {
  if (p.unit_amount == null) return "—";
  const value = p.unit_amount / 100;
  const formatted = value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${p.currency.toUpperCase()}`;
}

function StripeSyncPanel({ priceMap, onClose, onSaved }: StripeSyncPanelProps) {
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [localMap, setLocalMap] = useState<PriceMap>(priceMap);

  useEffect(() => {
    setLocalMap(priceMap);
  }, [priceMap]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-prices-sync`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudieron cargar los precios.");
      setPrices(data.prices ?? []);
      setLocalMap(data.mapping ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los precios de Stripe.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assignPrice = useCallback(async (planKey: string, priceId: string) => {
    setSavingKey(planKey);
    setError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-prices-sync`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ plan_key: planKey, price_id: priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar la asignación.");
      setLocalMap((prev) => ({ ...prev, [planKey]: priceId }));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la asignación.");
    } finally {
      setSavingKey(null);
    }
  }, [onSaved]);

  const paidPlans = SUBSCRIPTION_PLANS.filter((p) => !p.isFree);

  return (
    <div
      className="absolute inset-0 z-[85] flex items-center justify-center bg-black/50 px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] max-h-[90%] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#635bff]">
              <RefreshCw className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-black">Sincronizar precios</h3>
              <p className="text-xs font-medium text-gray-500">Asigna cada plan a un precio de Stripe</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-black transition-colors hover:bg-[#e5e7eb]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 animate-fade-in">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
          </div>
        ) : prices.length === 0 ? (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 text-center text-sm font-medium text-gray-600">
            No se encontraron precios de suscripción activos en tu cuenta de Stripe. Crea primero los productos en el panel de Stripe y vuelve a pulsar el botón de refrescar.
          </div>
        ) : (
          <div className="space-y-4">
            {paidPlans.map((plan) => {
              const assigned = localMap[plan.planKey];
              return (
                <div key={plan.planKey} className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {plan.icon}
                      <div>
                        <p className="text-sm font-bold text-black">{plan.name}</p>
                        <p className="text-xs font-medium text-gray-500">{plan.price}€/mes</p>
                      </div>
                    </div>
                    {assigned && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">
                        Asignado
                      </span>
                    )}
                  </div>
                  <select
                    value={assigned ?? ""}
                    onChange={(e) => e.target.value && assignPrice(plan.planKey, e.target.value)}
                    disabled={savingKey === plan.planKey}
                    className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm font-medium text-black outline-none transition-colors focus:border-[#635bff] disabled:opacity-50"
                  >
                    <option value="">— Selecciona un precio —</option>
                    {prices.map((p) => {
                      const label = `${formatAmount(p)} · ${p.interval ?? "puntual"}${p.product_name ? ` · ${p.product_name}` : ""} · ${p.id}`;
                      return (
                        <option key={p.id} value={p.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  {savingKey === plan.planKey && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#635bff]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Guardando...
                    </p>
                  )}
                  {assigned && savingKey !== plan.planKey && (
                    <p className="mt-1.5 text-[11px] font-medium text-gray-400">
                      Precio activo: {assigned}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-4 text-xs font-bold uppercase tracking-wide text-black transition-all hover:bg-[#f3f4f6] active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refrescar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center justify-center rounded-xl bg-[#635bff] px-5 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-[#5851eb] active:scale-95"
          >
            Hecho
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Premium Page (subscription shop) ---------- */

type PremiumPageProps = {
  onOpenDrawer: () => void;
  onOpenWallet: () => void;
  tokenBalance: number;
  adLoading: boolean;
  onWatchAd: () => void;
  userEmail: string | null;
  priceMap: PriceMap;
  onRequireLogin: () => void;
  onOpenSync: () => void;
};

function PremiumPage({ onOpenDrawer, onOpenWallet, tokenBalance, adLoading, onWatchAd, userEmail, priceMap, onRequireLogin, onOpenSync }: PremiumPageProps) {
  const [checkoutPlan, setCheckoutPlan] = useState<{ name: string; price: string; priceId: string; mode: "payment" | "subscription" } | null>(null);

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (!userEmail) {
      onRequireLogin();
      return;
    }
    const resolvedPriceId = plan.planKey ? (priceMap[plan.planKey] ?? "") : plan.priceId;
    if (!resolvedPriceId) {
      onOpenSync();
      return;
    }
    setCheckoutPlan({ name: plan.name, price: plan.price, priceId: resolvedPriceId, mode: plan.mode });
  };

  return (
    <section className="flex w-full flex-1 flex-col overflow-y-auto">
      <div className="w-full flex justify-between items-center mb-10">
        <div className="flex items-center gap-2 @lg:hidden">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-black transition-colors hover:bg-[#f3f4f6] active:scale-90"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

        </div>
        <h1 className="text-xl @lg:text-3xl font-bold tracking-[-0.5px] text-black">Planes</h1>
        <div className="flex items-center gap-2 mr-1 @lg:hidden">
          <button
            type="button"
            onClick={onOpenSync}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e5e7eb] text-black transition-colors hover:bg-[#f3f4f6] active:scale-90"
            aria-label="Sincronizar precios de Stripe"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
        </div>
      </div>

      <div className="grid grid-cols-1 @lg:grid-cols-3 gap-3">
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
                onClick={() => handleSubscribe(plan)}
                className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-wide transition-all active:scale-[0.98] ${
                  plan.highlight
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-blue-600 text-white hover:bg-[#0a6fd4]"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                {priceMap[plan.planKey] ? "Suscribirme ahora" : "Configurar precio"}
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
              <p className="text-xs font-medium text-amber-600">Gana +0,25 créditos gratis viendo un anuncio</p>
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
          priceId={checkoutPlan.priceId}
          mode={checkoutPlan.mode}
          userEmail={userEmail}
          onClose={() => setCheckoutPlan(null)}
        />
      )}
    </section>
  );
}

/* ---------- Desktop Top Bar ---------- */

type DesktopTopBarProps = {
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
  onOpenDrawer: () => void;
  onLogout: () => void;
};

function DesktopTopBar({
  activeTab,
  onTabChange,
  isLoggedIn,
  loggedInEmail,
  tokenBalance,
  onOpenWallet,
  onOpenLogin,
  onOpenProfile,
  onOpenDrawer,
}: DesktopTopBarProps) {
  const leftItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "inicio", label: "Inicio", icon: <Home className="h-4 w-4" /> },
    { id: "biblioteca", label: "Biblioteca", icon: <BookOpen className="h-4 w-4" /> },
  ];
  const rightItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "botiquin", label: "Botiquín", icon: <Package className="h-4 w-4" /> },
    { id: "premium", label: "Planes", icon: <Crown className="h-4 w-4" /> },
  ];

  const renderTab = (item: { id: Tab; label: string; icon: React.ReactNode }) => {
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onTabChange(item.id)}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
          active
            ? "bg-blue-50 text-[#087ff5]"
            : "text-gray-600 hover:bg-[#f3f4f6]"
        }`}
      >
        <span className={active ? "text-[#087ff5]" : "text-gray-400"}>{item.icon}</span>
        {item.label}
      </button>
    );
  };

  return (
    <header className="hidden @lg:flex items-center justify-between gap-2 border-b border-[#e5e7eb] bg-white px-4 py-2.5 shrink-0">
      {/* Left: logo + hamburger */}
      <div className="flex items-center gap-2 min-w-0">
        <img
          src="/logo_snapcleAIn_positivo.png"
          alt="snapcleAIn"
          className="h-9 w-auto object-contain shrink-0"
        />
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-[#f3f4f6] active:scale-90"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Center: nav menu (Inicio, Biblioteca, Escanear, Botiquín, Planes) */}
      <nav className="flex items-center gap-1.5">
        {leftItems.map(renderTab)}
        <button
          key="escanear"
          type="button"
          onClick={() => onTabChange("escanear")}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
            activeTab === "escanear"
              ? "bg-blue-50 text-[#087ff5]"
              : "text-gray-600 hover:bg-[#f3f4f6]"
          }`}
        >
          <span className={activeTab === "escanear" ? "text-[#087ff5]" : "text-gray-400"}>
            <Camera className="h-4 w-4" />
          </span>
          Escanear
        </button>
        {rightItems.map(renderTab)}
      </nav>

      {/* Right: tokens (left) + login (right) */}
      <div className="flex items-center gap-2 shrink-0">
        <WalletBadge balance={tokenBalance} onClick={onOpenWallet} />
        <button
          type="button"
          onClick={() => (isLoggedIn ? onOpenProfile() : onOpenLogin())}
          className="flex h-9 items-center gap-1.5 rounded-full border border-[#e5e7eb] px-3 text-sm font-semibold text-black transition-colors hover:bg-[#f3f4f6] active:scale-95"
          aria-label={isLoggedIn ? "Perfil" : "Iniciar sesión"}
        >
          {isLoggedIn ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          <span className="max-w-[120px] truncate">
            {isLoggedIn ? loggedInEmail : "Iniciar sesión"}
          </span>
        </button>
      </div>
    </header>
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
    { id: "premium", label: "Planes", icon: <Crown className="h-5 w-5" /> },
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
    <nav className="absolute bottom-4 left-4 z-50 flex w-[calc(100%-2rem)] items-center justify-around rounded-2xl border border-[#e5e7eb] bg-white px-2 py-2 shadow-lg">
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
  const [mobilePreview, setMobilePreview] = useState(false);
  const [showStripeSync, setShowStripeSync] = useState(false);
  const { priceMap, refresh: refreshPriceMap } = useStripePriceMap();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const email = data.session.user.email ?? "";
        setIsLoggedIn(true);
        setLoggedInEmail(email);
        setTokenBalance(loadTokenBalance(email));
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const email = session.user.email ?? "";
          setIsLoggedIn(true);
          setLoggedInEmail(email);
          setTokenBalance(loadTokenBalance(email));
        } else {
          setIsLoggedIn(false);
          setLoggedInEmail("");
          setTokenBalance(loadTokenBalance(null));
        }
      })();
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

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

  const watchAd = useCallback(async () => {
    setAdLoading(true);
    const rewarded = await showRewardedAd((loading) => setAdLoading(loading));
    if (rewarded) {
      setTokenBalance((prev) => {
        const next = +(prev + 0.25).toFixed(2);
        saveTokenBalance(next, loggedInEmail || null);
        return next;
      });
    }
    setAdLoading(false);
  }, [loggedInEmail]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === "escanear") setView("scan");
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f5f7] overflow-hidden py-4">
      <div className={`${mobilePreview ? "max-w-[390px] w-full max-h-[844px] h-[100dvh] p-5 pb-20 flex-col" : "max-w-[390px] w-full max-h-[844px] h-[100dvh] p-5 pb-20 lg:max-w-[1200px] lg:max-h-none lg:h-[min(100dvh-2rem,920px)] lg:p-6 lg:pb-6 lg:flex-col"} bg-white rounded-3xl shadow-xl flex flex-col mx-auto relative overflow-hidden @container`}>
        {/* Desktop top bar */}
        <DesktopTopBar
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
          onOpenDrawer={openDrawer}
          onLogout={async () => {
            await supabase.auth.signOut();
            setIsLoggedIn(false);
            setLoggedInEmail("");
            setTokenBalance(loadTokenBalance(null));
            setShowProfilePanel(false);
          }}
        />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
              userEmail={isLoggedIn ? loggedInEmail : null}
              priceMap={priceMap}
              onRequireLogin={() => setDrawerPanel("login")}
              onOpenSync={() => setShowStripeSync(true)}
            />
          )}
        </div>

        {/* Bottom tab bar - mobile only */}
        <div className="@lg:hidden">
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Mobile/desktop view toggle - always visible */}
        <button
          type="button"
          onClick={() => setMobilePreview(!mobilePreview)}
          className="absolute bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black shadow-lg border border-[#e5e7eb] transition-all hover:bg-[#f3f4f6] active:scale-95"
          aria-label={mobilePreview ? "Vista ordenador" : "Vista móvil"}
        >
          <Smartphone className="h-3.5 w-3.5 text-[#087ff5]" />
          {mobilePreview ? "Ordenador" : "Móvil"}
        </button>

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
          <div className="absolute bottom-20 left-5 right-5 z-40 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 animate-fade-in">
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
            userEmail={isLoggedIn ? loggedInEmail : null}
            priceMap={priceMap}
            onClose={closeDrawer}
            onWatchAd={watchAd}
            onRequireLogin={() => { closeDrawer(); setDrawerPanel("login"); }}
            onOpenSync={() => { closeDrawer(); setShowStripeSync(true); }}
          />
        )}

        {showProfilePanel && isLoggedIn && (
          <div className="absolute inset-0 z-[70] flex" onClick={() => setShowProfilePanel(false)}>
            <div
              className="flex h-full w-[280px] max-w-[80%] flex-col bg-white p-5 animate-slide-in-right shadow-2xl ml-auto"
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
                onClick={async () => {
                  await supabase.auth.signOut();
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

        {showStripeSync && (
          <StripeSyncPanel
            priceMap={priceMap}
            onClose={() => setShowStripeSync(false)}
            onSaved={refreshPriceMap}
          />
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
  );
}

export default App;
