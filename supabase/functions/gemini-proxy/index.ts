const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const GEMINI_API_KEY = "AQ.Ab8RN6Jk4b25WPbbRS1SshFDtdW428Y9S1g8m1NauLyxyI_3dA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(
  model: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: unknown; errorText: string }> {
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, errorText: text };
    }
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, data: null, errorText: "Respuesta no es JSON válido." };
    }
    return { ok: true, status: res.status, data, errorText: "" };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorText: err instanceof Error ? err.message : "Error de red.",
    };
  }
}

async function callWithRetries(
  model: string,
  body: unknown,
): Promise<{ ok: boolean; data: unknown; lastStatus: number }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await callGemini(model, body);
    if (result.ok) {
      return { ok: true, data: result.data, lastStatus: 200 };
    }
    const retryable = RETRYABLE_STATUS.has(result.status) || result.status === 0;
    if (!retryable || attempt === MAX_RETRIES) {
      return { ok: false, data: null, lastStatus: result.status || 500 };
    }
    await sleep(BACKOFF_MS[attempt] ?? 4000);
  }
  return { ok: false, data: null, lastStatus: 500 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Primary model with retries
    const primary = await callWithRetries(PRIMARY_MODEL, body);
    if (primary.ok) {
      return new Response(JSON.stringify(primary.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback model with retries
    const fallback = await callWithRetries(FALLBACK_MODEL, body);
    if (fallback.ok) {
      return new Response(JSON.stringify(fallback.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Both failed with retryable errors -> friendly overload message
    const retryablePrimary = RETRYABLE_STATUS.has(primary.lastStatus) || primary.lastStatus === 0;
    const retryableFallback = RETRYABLE_STATUS.has(fallback.lastStatus) || fallback.lastStatus === 0;
    if (retryablePrimary && retryableFallback) {
      return new Response(
        JSON.stringify({ error: "OVERLOADED", message: "El servicio está muy ocupado, inténtalo de nuevo en unos segundos." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Non-retryable error from either model
    return new Response(
      JSON.stringify({ error: "OVERLOADED", message: "El servicio está muy ocupado, inténtalo de nuevo en unos segundos." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "OVERLOADED", message: "El servicio está muy ocupado, inténtalo de nuevo en unos segundos." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
