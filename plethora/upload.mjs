#!/usr/bin/env node
// Uploads plethora/dist/main.js + plethora/plethora.json as a Plethora DRAFT.
//
//   node plethora/upload.mjs --token-file <path to pairing token.json> \
//        --feedback <path to agentFeedback.json> [--state-dir <dir>] [--dry-run]
//
// Protocol: https://agent.plethora.studio/v1/agent/upload.md
// - Re-fetches context.json and refuses to upload if the context version moved.
// - Serialises the body with JSON.stringify (never shell string splicing).
// - Reuses the Idempotency-Key only when retrying the *same* payload; a changed
//   payload gets a new key. Keys and receipts live in --state-dir, never in git.
// - Never prints the access token. Prints a redacted response envelope.
import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// agent.plethora.studio sits behind Cloudflare; from this machine the IPv6
// path times out while IPv4 answers, so prefer IPv4 (observed 2026-11-02).
dns.setDefaultResultOrder('ipv4first');

const ORIGIN = 'https://agent.plethora.studio';
const BUILT_CONTEXT_VERSION = 'plethora-agent-context-2026-10-22.1';
const HERE = dirname(fileURLToPath(import.meta.url));

/** fetch with bounded retries on connection errors and 5xx; a retried POST reuses the same Idempotency-Key. */
async function fetchRetry(url, options, tries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await globalThis.fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, options));
      if (res.status >= 500 && attempt < tries) {
        console.error(`attempt ${attempt}: HTTP ${res.status}, retrying`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      const code = (err && err.cause && err.cause.code) || err.name || err.message;
      console.error(`attempt ${attempt}: ${code}${attempt < tries ? ', retrying' : ''}`);
      if (attempt < tries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(name);

const tokenFile = arg('--token-file');
const feedbackFile = arg('--feedback');
const stateDir = resolve(arg('--state-dir', join(dirname(tokenFile || HERE), 'upload-state')));
const dryRun = flag('--dry-run');

if (!tokenFile || !existsSync(tokenFile)) {
  console.error('Missing --token-file (the pairing exchange response with data.accessToken).');
  process.exit(2);
}
if (!feedbackFile || !existsSync(feedbackFile)) {
  console.error('Missing --feedback (agentFeedback JSON object).');
  process.exit(2);
}
mkdirSync(stateDir, { recursive: true });

const token = JSON.parse(readFileSync(tokenFile, 'utf8')).data.accessToken;
if (typeof token !== 'string' || token.length < 10) {
  console.error('token.json has no data.accessToken');
  process.exit(2);
}

const source = readFileSync(join(HERE, 'dist', 'main.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(HERE, 'plethora.json'), 'utf8'));
const agentFeedback = JSON.parse(readFileSync(feedbackFile, 'utf8'));

const FIRST_LINE = '// Plethora Bit · docs and draft upload: https://agent.plethora.studio/v1/agent/start.md';
if (source.split('\n')[0] !== FIRST_LINE) {
  console.error('dist/main.js must start with the Plethora first-line comment.');
  process.exit(2);
}
if (manifest.display !== 'fullscreen') {
  console.error('manifest.display must be "fullscreen" for a publishable draft.');
  process.exit(2);
}

// 0. Context version must still be the one we built against.
const ctxRes = await fetchRetry(`${ORIGIN}/v1/agent/context.json`);
const ctxJson = await ctxRes.json();
const liveVersion = ctxJson && ctxJson.data && ctxJson.data.overview && ctxJson.data.overview.contextVersion;
if (liveVersion !== BUILT_CONTEXT_VERSION) {
  console.error(`Context version changed: built against ${BUILT_CONTEXT_VERSION}, live is ${liveVersion}. Re-read the docs before uploading.`);
  process.exit(3);
}
agentFeedback.contextVersion = liveVersion;
agentFeedback.sdkVersion = agentFeedback.sdkVersion || (ctxJson.data.overview.sdkVersion || '1.7.0');

const body = {
  title: manifest.title,
  description: manifest.description,
  tags: manifest.tags,
  manifest,
  source,
  generated: true,
  agentFeedback,
};
const payload = JSON.stringify(body);
const payloadHash = createHash('sha256').update(payload).digest('hex');

// Idempotency key: same payload → same key (safe retry); new payload → new key.
const keyFile = join(stateDir, 'idempotency.json');
let keyState = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, 'utf8')) : null;
if (!keyState || keyState.payloadHash !== payloadHash) {
  keyState = { key: randomUUID(), payloadHash, createdAt: new Date().toISOString() };
  writeFileSync(keyFile, JSON.stringify(keyState, null, 2));
}

console.log(`payload bytes: ${Buffer.byteLength(payload)} (source ${Buffer.byteLength(source)} bytes)`);
console.log(`payload sha256: ${payloadHash}`);
console.log(`idempotency key: ${keyState.key}`);
if (dryRun) {
  console.log('dry run: not uploading');
  process.exit(0);
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'source' || k === 'source_draft' || k === 'source_published') out[k] = `<${String(v).length} chars>`;
      else if (k === 'accessToken' || k === 'sessionSecret') out[k] = '<redacted>';
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

const headers = {
  Authorization: `Plethora-Agent ${token}`,
  'Content-Type': 'application/json',
  'X-Plethora-Command-Protocol': 'v1',
  'Idempotency-Key': keyState.key,
};

const res = await fetchRetry(`${ORIGIN}/v1/agent/bits/drafts`, { method: 'POST', headers, body: payload });
const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch (_) {
  json = { raw: text.slice(0, 2000) };
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(stateDir, `response-${stamp}.json`), JSON.stringify({ status: res.status, commandId: res.headers.get('x-plethora-command-id'), body: redact(json) }, null, 2));
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(redact(json), null, 2));

if (res.status === 202) {
  const commandId = (json && json.data && json.data.command && json.data.command.id) || res.headers.get('x-plethora-command-id');
  console.log(`command pending: ${commandId}; polling status`);
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetchRetry(`${ORIGIN}/v1/agent/commands/${commandId}`, {
      headers: { Authorization: `Plethora-Agent ${token}`, 'X-Plethora-Command-Protocol': 'v1' },
    });
    const sj = await st.json().catch(() => null);
    const status = sj && sj.data && sj.data.command && sj.data.command.status;
    console.log(`  status: ${status}`);
    if (sj && sj.data && sj.data.result) {
      console.log(JSON.stringify(redact(sj.data.result), null, 2));
      writeFileSync(join(stateDir, `command-${stamp}.json`), JSON.stringify(redact(sj), null, 2));
      break;
    }
  }
}
process.exit(res.ok ? 0 : 1);
