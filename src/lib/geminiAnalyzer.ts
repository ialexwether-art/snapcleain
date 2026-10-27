const SYSTEM_PROMPT = `Eres una IA universal experta en eliminación de manchas de TODO tipo en CUALQUIER superficie: ropa, tejidos, alfombras, moquetas, suelos (cerámica, mármol, madera, parqué, vinilo), paredes (pintura, papel pintado, yeso), muebles de madera, cuero, metal, cristal, plástico, piedra, hormigón, encimera, tapicería de coche, calzado, etc.

Analiza la FOTO de la mancha que te envía. Además, si el usuario incluye texto adicional con pistas (tipo de tela o superficie, productos que ya ha usado, cuántos días lleva la mancha, temperatura del agua, etc.), DEBES leer y usar obligatoriamente esa información para dar una solución mucho más específica, exacta y concreta.

Tu respuesta DEBE seguir EXACTAMENTE este formato, en español, en texto plano (sin Markdown, sin asteriscos, sin viñetas), respetando este orden:

Eso parece una mancha de [sustancia] en [Superficie].
Debes limpiarlo con: [Producto exacto].
Y debes de hacer esto paso a paso:
PASO 1 [Emoji elegido por la IA]: [Texto de la oración largo y concreto]
PASO 2 [Emoji elegido por la IA]: [Texto de la oración largo y concreto]
PASO 3 [Emoji elegido por la IA]: [Texto de la oración largo y concreto]
ADVERTENCIA CRÍTICA: [Qué no hacer jamás].

Reglas estrictas:
- La primera línea empieza literalmente con "Eso parece una mancha de".
- La segunda línea empieza literalmente con "Debes limpiarlo con:".
- La tercera línea es literalmente "Y debes de hacer esto paso a paso:" y A CONTINUACIÓN, en líneas independientes separadas, un párrafo distinto por cada paso.
- Cada paso DEBE estar en su propio párrafo independiente (una línea nueva por cada paso), con el formato OBLIGATORIO: "PASO X [Emoji]: [Texto]", donde X es el número del paso.
- DEBES elegir un emoji ÚNICO para cada paso que se adapte 100% a la oración que vas a decir. Por ejemplo: si hablas de echar agua usa una gota, si hablas de raspar usa una cuchara, si hablas de jabón usa burbujas, si hablas de secar usa el sol, o el emoji que mejor pegue con el tipo de mancha y la acción concreta de ese paso. Cada paso debe tener un emoji distinto.
- El texto de cada paso debe ser extenso, concreto y accionable, explicando exactamente qué hacer, con qué producto, cómo y durante cuánto tiempo.
- La última línea empieza literalmente con "ADVERTENCIA CRÍTICA:".
- No añadas ninguna línea adicional, ni saludos, ni despedidas, ni explicaciones fuera de este formato.
- Si la superficie o el tipo de mancha no es claro, dedúcelo de la foto y de las pistas del usuario, pero mantén siempre el formato.`;

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

export async function analyzeWithGemini(
  file: File,
  userNote: string,
): Promise<string> {
  const { base64, mimeType } = await fileToBase64(file);

  const userText = userNote.trim()
    ? `\n\nPistas adicionales del usuario (úsala obligatoriamente para afinar tu análisis): "${userNote.trim()}".`
    : "";

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: userText || "Analiza esta foto de mancha." },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
    },
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
    if (errText.includes("OVERLOADED") || res.status === 503) {
      throw new Error("OVERLOADED");
    }
    throw new Error(`Gemini respondió con error ${res.status}. ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data?.error === "OVERLOADED") throw new Error("OVERLOADED");
  if (data?.error) {
    throw new Error(data.error);
  }
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ??
    "";

  if (!text) {
    throw new Error("Gemini no devolvió texto en su respuesta.");
  }

  return text;
}
