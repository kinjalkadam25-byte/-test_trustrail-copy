import type { AnomalyResult, FeatureVector } from '../types';

/**
 * Calls the ML microservice's POST /ml/flag (see Technical Architecture §6).
 * That service is intentionally NOT part of this scaffold — this client is
 * the integration point Parth's Flask/Isolation Forest service plugs into.
 *
 * Behavior with no ML service configured/running: returns `null` and the
 * caller simply skips writing an anomaly_flags row. Nothing else in the app
 * depends on this succeeding — disbursements, allocation, ledger writes, and
 * bill verification all work identically with or without it.
 */
export async function getAnomalyFlag(features: FeatureVector): Promise<AnomalyResult | null> {
  const baseUrl = process.env.ML_SERVICE_URL;
  if (!baseUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ml/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`ML service responded ${res.status}, skipping anomaly flag for this disbursement`);
      return null;
    }
    const data = (await res.json()) as AnomalyResult;
    return data;
  } catch (err) {
    console.warn('ML service unreachable, skipping anomaly flag:', (err as Error).message);
    return null;
  }
}
