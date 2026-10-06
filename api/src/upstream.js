/**
 * The live feed behind must.ware.baby: a Cloudflare Worker that answers
 * POST {"action":"load"} with the current sheet state.
 */
const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://base44-het-cloud.minhphuongptit97.workers.dev';
const UPSTREAM_TOKEN = process.env.UPSTREAM_TOKEN || '';

export async function fetchLiveState() {
  const res = await fetch(UPSTREAM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${UPSTREAM_TOKEN}`,
    },
    body: JSON.stringify({ action: 'load' }),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);

  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) {
    throw new Error(`feed error: ${data?.error || 'unreadable response'}`);
  }
  return data;
}
