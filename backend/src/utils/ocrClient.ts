import type { OcrResult } from '../types';

/**
 * Calls the ML microservice's POST /ocr/receipt (Gemini vision-based receipt
 * extraction). Runs in the background after a bill upload response has
 * already been sent (see routes/bills.ts's waitUntil call) -- a slow or
 * failed OCR call never blocks or fails the upload itself, same fail-open
 * contract as getAnomalyFlag() in mlClient.ts.
 */
export async function extractReceiptData(fileBase64: string, mimeType: string): Promise<OcrResult | null> {
  const baseUrl = process.env.ML_SERVICE_URL;
  if (!baseUrl) return null;

  try {
    const controller = new AbortController();
    // Vision-model calls run noticeably slower than the isolation-forest
    // model's /ml/flag -- generous timeout since nothing is waiting on this.
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ocr/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, mimeType }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`OCR service responded ${res.status}, skipping receipt extraction for this bill`);
      return null;
    }
    const data = (await res.json()) as OcrResult;
    return data;
  } catch (err) {
    console.warn('OCR service unreachable, skipping receipt extraction:', (err as Error).message);
    return null;
  }
}
