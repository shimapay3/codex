import express from 'express';
import { buildSnapshot, revisionOf } from './parse.js';
import { fetchLiveState } from './upstream.js';

const PORT = Number(process.env.PORT || 8000);
const POLL_MS = Math.max(1000, Number(process.env.POLL_MS || 5000));
const RATE = Number(process.env.RATE_VND || 300000);
const KEEPALIVE_MS = 30000;

let snapshot = {
  status: 'connecting',
  sheetName: '',
  updated: null,
  savedAt: null,
  fetchedAt: null,
  rate: RATE,
  cols: [],
  rows: [],
  totals: { ban: 0, vnd: 0 },
  stats: null,
  error: null,
  revision: null,
};
let lastAttemptAt = 0;
let lastBroadcastAt = 0;
const clients = new Set();

function broadcast() {
  lastBroadcastAt = Date.now();
  const frame = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
  for (const client of clients) {
    try {
      client.write(frame);
    } catch {
      clients.delete(client);
    }
  }
}

async function poll() {
  lastAttemptAt = Date.now();
  try {
    const payload = await fetchLiveState();
    const next = buildSnapshot(payload, { rate: RATE, fetchedAt: new Date().toISOString() });
    const revision = revisionOf(next);
    const changed = revision !== snapshot.revision || snapshot.status !== next.status;
    snapshot = { ...next, revision };
    if (changed || Date.now() - lastBroadcastAt > KEEPALIVE_MS) broadcast();
  } catch (err) {
    const message = err?.message || 'feed unavailable';
    if (snapshot.status !== 'offline') {
      snapshot = { ...snapshot, status: 'offline', error: message };
      broadcast();
    } else {
      snapshot = { ...snapshot, error: message };
    }
  }
}

async function pollLoop() {
  await poll();
  setTimeout(pollLoop, POLL_MS);
}

const app = express();
app.disable('x-powered-by');

app.get('/api/snapshot', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(snapshot);
});

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.get('/api/healthz', (_req, res) => {
  const age = Date.now() - lastAttemptAt;
  const pollerAlive = lastAttemptAt > 0 && age < POLL_MS * 4;
  res.status(pollerAlive ? 200 : 503).json({
    ok: pollerAlive,
    feed: snapshot.status,
    feedError: snapshot.error,
    lastPollMsAgo: lastAttemptAt ? age : null,
    clients: clients.size,
  });
});

setInterval(() => {
  for (const client of clients) {
    try {
      client.write(': ping\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, 20000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] live mirror listening on :${PORT} (poll ${POLL_MS}ms, rate ${RATE})`);
  pollLoop();
});
