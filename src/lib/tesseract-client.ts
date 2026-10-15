// On-device OCR fallback (free, no API key): loads Tesseract.js from a CDN
// on demand and runs recognition in the browser's main thread. Used when no
// Groq key is configured — the server /capture/extract route answers 503
// and the caller runs this instead, then ships the text back via the
// applyOcrText server action. Accuracy is lower than the Groq vision model,
// so failures guide the user to Settings → AI Ambassador.
declare global {
  // eslint-disable-next-line no-var
  interface Window {
    Tesseract?: {
      recognize: (image: Blob | File, lang: string) => Promise<{ data: { text?: string } }>;
    };
  }
}

const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

async function ensureTesseract(): Promise<NonNullable<Window["Tesseract"]>> {
  if (typeof window === "undefined") throw new Error("On-device OCR only runs in the browser");
  if (window.Tesseract) return window.Tesseract;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the on-device OCR engine (offline or blocked)"));
    document.head.appendChild(s);
  });
  if (!window.Tesseract) throw new Error("On-device OCR engine failed to initialize");
  return window.Tesseract;
}

export async function readImageOnDevice(file: Blob | File): Promise<string> {
  const T = await ensureTesseract();
  const { data } = await T.recognize(file, "eng");
  return (data.text ?? "").trim();
}
