#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Usage Report
 *
 * Displays a usage summary after each prompt cycle, including token usage,
 * estimated cost, context window fill, and rate limit utilization.
 *
 * No external dependencies - uses only Claude Code's own data.
 *
 * Toggle: Create/remove ~/.claude/.usage-report-disabled to disable/enable.
 *         Or run: claude-usage-report enable|disable|status
 *
 * Input (stdin): { session_id, transcript_path, cwd, stop_hook_active, ... }
 * Output: JSON to stdout with stopReason field.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import https from 'https';

const HOME = process.env.HOME;
const CLAUDE_DIR = join(HOME, '.claude');
const DISABLED_FLAG = join(CLAUDE_DIR, '.usage-report-disabled');
const CREDENTIALS_PATH = join(CLAUDE_DIR, '.credentials.json');
const USAGE_CACHE_PATH = join(CLAUDE_DIR, 'plugins', 'oh-my-claudecode', '.usage-cache.json');
const RATE_CACHE_PATH = join(CLAUDE_DIR, '.rate-usage-cache.json');

// ─── CLI toggle mode ────────────────────────────────────────────────────────

const cliArg = process.argv[2];
if (cliArg === 'enable') {
  if (existsSync(DISABLED_FLAG)) { unlinkSync(DISABLED_FLAG); console.log('Usage report enabled.'); }
  else { console.log('Usage report is already enabled.'); }
  process.exit(0);
} else if (cliArg === 'disable') {
  if (!existsSync(DISABLED_FLAG)) { writeFileSync(DISABLED_FLAG, '', 'utf-8'); console.log('Usage report disabled.'); }
  else { console.log('Usage report is already disabled.'); }
  process.exit(0);
} else if (cliArg === 'status') {
  const disabled = existsSync(DISABLED_FLAG);
  console.log(disabled ? 'Usage report is DISABLED.' : 'Usage report is ENABLED.');
  console.log(disabled ? 'Run: claude-usage-report enable' : 'Run: claude-usage-report disable');
  process.exit(0);
}

// ─── Disabled check ─────────────────────────────────────────────────────────

if (existsSync(DISABLED_FLAG)) {
  process.exit(0);
}

// Cost estimates per 1M tokens
const COST_PER_1M = {
  'opus':   { input: 15.0,  output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
  'sonnet': { input: 3.0,   output: 15.0, cacheWrite: 3.75,  cacheRead: 0.30 },
  'haiku':  { input: 0.80,  output: 4.0,  cacheWrite: 1.0,   cacheRead: 0.08 },
};

// ─── Read stdin ──────────────────────────────────────────────────────────────

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    setTimeout(() => resolve({}), 2000);
  });
}

// ─── Parse transcript for token usage ────────────────────────────────────────

function getTokensFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    requestCount: 0,
    models: {},
    firstTimestamp: null,
    lastTimestamp: null,
    // Per-prompt-cycle tracking
    lastPromptStartTimestamp: null,
    lastPromptModels: {},
    // Context tracking at prompt-cycle level
    prevPromptContextTokens: 0,
    currentPromptContextTokens: 0,
  };

  let content;
  try {
    content = readFileSync(transcriptPath, 'utf-8');
  } catch { return null; }

  let lastSeenUserTimestamp = null;
  let currentPromptUser = null;

  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Track user message timestamps
    if (entry.type === 'user' && entry.timestamp && !entry.isMeta) {
      lastSeenUserTimestamp = entry.timestamp;
      continue;
    }

    if (entry.type !== 'assistant') continue;

    const msg = entry.message;
    if (!msg || !msg.usage) continue;

    const usage = msg.usage;
    const inputTok = usage.input_tokens || 0;
    const outputTok = usage.output_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const contextForThisResponse = inputTok + cacheRead + cacheWrite;

    totals.inputTokens += inputTok;
    totals.outputTokens += outputTok;
    totals.cacheCreationTokens += cacheWrite;
    totals.cacheReadTokens += cacheRead;
    totals.requestCount++;

    const ts = entry.timestamp;
    if (ts) {
      if (!totals.firstTimestamp) totals.firstTimestamp = ts;
      totals.lastTimestamp = ts;
    }

    // Detect new prompt cycle when user message changes
    if (lastSeenUserTimestamp && lastSeenUserTimestamp !== currentPromptUser) {
      totals.prevPromptContextTokens = totals.currentPromptContextTokens;
      currentPromptUser = lastSeenUserTimestamp;
      totals.lastPromptStartTimestamp = lastSeenUserTimestamp;
      totals.lastPromptModels = {};
    }

    // Always update current prompt's context to the latest response
    totals.currentPromptContextTokens = contextForThisResponse;

    const model = msg.model || 'unknown';
    if (!totals.models[model]) totals.models[model] = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    totals.models[model].input += inputTok;
    totals.models[model].output += outputTok;
    totals.models[model].cacheWrite += cacheWrite;
    totals.models[model].cacheRead += cacheRead;

    // Accumulate last prompt cycle per-model tokens
    if (!totals.lastPromptModels[model]) totals.lastPromptModels[model] = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    totals.lastPromptModels[model].input += inputTok;
    totals.lastPromptModels[model].output += outputTok;
    totals.lastPromptModels[model].cacheWrite += cacheWrite;
    totals.lastPromptModels[model].cacheRead += cacheRead;
  }

  return totals.requestCount > 0 ? totals : null;
}

// ─── OAuth credentials ──────────────────────────────────────────────────────

function getCredentials() {
  try {
    if (!existsSync(CREDENTIALS_PATH)) return null;
    const parsed = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const creds = parsed.claudeAiOauth || parsed;
    if (creds.accessToken) {
      if (creds.expiresAt && creds.expiresAt <= Date.now()) return null;
      return creds.accessToken;
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Fetch usage from Anthropic API ─────────────────────────────────────────

function fetchUsageApi(accessToken) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        } else { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ─── Read cached usage (own cache with longer TTL) ─────────────────────────

function getOwnCachedRate() {
  try {
    if (!existsSync(RATE_CACHE_PATH)) return null;
    const cache = JSON.parse(readFileSync(RATE_CACHE_PATH, 'utf-8'));
    if (Date.now() - cache.timestamp < 1800000 && cache.data) {
      return { data: cache.data, stale: (Date.now() - cache.timestamp) > 300000 };
    }
  } catch { /* ignore */ }
  return null;
}

function saveOwnCachedRate(data) {
  try {
    writeFileSync(RATE_CACHE_PATH, JSON.stringify({ timestamp: Date.now(), data }), 'utf-8');
  } catch { /* ignore */ }
}

// ─── Read OMC cached usage ─────────────────────────────────────────────────

function getOmcCachedUsage() {
  try {
    if (!existsSync(USAGE_CACHE_PATH)) return null;
    const cache = JSON.parse(readFileSync(USAGE_CACHE_PATH, 'utf-8'));
    if (Date.now() - cache.timestamp < 300000 && cache.data) {
      return cache.data;
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Get rate limits (own cache -> OMC cache -> API) ────────────────────────

async function getRateLimits() {
  const ownCached = getOwnCachedRate();
  if (ownCached && !ownCached.stale) return ownCached.data;

  const omcCached = getOmcCachedUsage();
  if (omcCached) return omcCached;

  const token = getCredentials();
  if (!token) return ownCached?.data || null;

  const response = await fetchUsageApi(token);
  if (!response) return ownCached?.data || null;

  const clamp = (v) => (v == null || !isFinite(v)) ? null : Math.max(0, Math.min(100, v));

  const data = {
    fiveHourPercent: clamp(response.five_hour?.utilization),
    weeklyPercent: clamp(response.seven_day?.utilization),
    fiveHourResetsAt: response.five_hour?.resets_at || null,
    weeklyResetsAt: response.seven_day?.resets_at || null,
    opusWeeklyPercent: clamp(response.seven_day_opus?.utilization),
    sonnetWeeklyPercent: clamp(response.seven_day_sonnet?.utilization),
  };

  saveOwnCachedRate(data);
  return data;
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmtTok(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function fmtDur(ms) {
  if (!ms || ms < 0) return 'N/A';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function getModelTier(modelName) {
  const m = (modelName || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('haiku')) return 'haiku';
  return 'sonnet';
}

function estimateCostFromModels(models) {
  let total = 0;
  for (const [model, data] of Object.entries(models)) {
    const tier = getModelTier(model);
    const p = COST_PER_1M[tier];
    total += (data.input / 1e6) * p.input
           + (data.output / 1e6) * p.output
           + (data.cacheWrite / 1e6) * p.cacheWrite
           + (data.cacheRead / 1e6) * p.cacheRead;
  }
  return total;
}

function plainBar(percent, width = 20) {
  if (percent == null) return '[' + '.'.repeat(width) + '] N/A';
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'#'.repeat(filled)}${'.'.repeat(empty)}] ${percent.toFixed(1)}%`;
}

function timeUntil(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = new Date(isoStr) - new Date();
    if (diff <= 0) return ' (reset now)';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return ` (resets in ${h}h ${m}m)`;
  } catch { return ''; }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const input = await readStdin();

  if (input.stop_hook_active) {
    process.exit(0);
  }

  const transcriptPath = input.transcript_path || '';

  const tokens = getTokensFromTranscript(transcriptPath);
  const rateLimits = await getRateLimits();

  // Duration: time from last user message to last assistant response
  let durationMs = null;
  if (tokens && tokens.lastPromptStartTimestamp && tokens.lastTimestamp) {
    durationMs = new Date(tokens.lastTimestamp).getTime() - new Date(tokens.lastPromptStartTimestamp).getTime();
  }

  // Context delta between prompt cycles
  const contextWindowSize = 200000;
  let contextDelta = 0;
  let contextDeltaPercent = 0;
  let contextTotalPercent = 0;
  if (tokens) {
    contextDelta = Math.max(0, tokens.currentPromptContextTokens - tokens.prevPromptContextTokens);
    contextDeltaPercent = Math.min(100, (contextDelta / contextWindowSize) * 100);
    contextTotalPercent = Math.min(100, (tokens.currentPromptContextTokens / contextWindowSize) * 100);
  }

  // Cost & cache hit
  const lastPromptCost = tokens ? estimateCostFromModels(tokens.lastPromptModels) : 0;
  const totalCost = tokens ? estimateCostFromModels(tokens.models) : 0;
  const cacheHitRate = tokens && (tokens.cacheReadTokens + tokens.cacheCreationTokens) > 0
    ? (tokens.cacheReadTokens / (tokens.cacheReadTokens + tokens.cacheCreationTokens)) * 100
    : 0;

  // ─── Build plain-text report ───────────────────────────────────────────

  const L = [];
  L.push('────────────────────────────────────────────────────────');
  L.push('  SESSION USAGE REPORT');
  L.push('────────────────────────────────────────────────────────');
  L.push(`  Duration:  ${fmtDur(durationMs)}`);
  L.push('');

  if (tokens) {
    L.push('  Token Usage');
    L.push(`  Input:       ${fmtTok(tokens.inputTokens).padStart(8)}   Cache Write: ${fmtTok(tokens.cacheCreationTokens)}`);
    L.push(`  Output:      ${fmtTok(tokens.outputTokens).padStart(8)}   Cache Read:  ${fmtTok(tokens.cacheReadTokens)}`);
    L.push(`  Requests:    ${String(tokens.requestCount).padStart(8)}   Cache Hit:   ${cacheHitRate.toFixed(0)}%`);
    L.push(`  Est. Cost:   ${'$' + lastPromptCost.toFixed(4).padStart(7)}   Session:     $${totalCost.toFixed(4)}`);

    const modelNames = Object.keys(tokens.models);
    if (modelNames.length > 1) {
      L.push('');
      L.push('  Per-Model Breakdown');
      for (const model of modelNames) {
        const d = tokens.models[model];
        const modelTotal = d.input + d.output + d.cacheWrite + d.cacheRead;
        const shortName = model.replace('claude-', '').replace(/-\d.*$/, '');
        L.push(`  ${shortName}: ${fmtTok(modelTotal).padStart(8)} (in:${fmtTok(d.input)} out:${fmtTok(d.output)})`);
      }
    }
  } else {
    L.push('  Token Usage: No data found in transcript');
  }
  L.push('');

  L.push('  Context Window');
  L.push(`  Total:  ${plainBar(contextTotalPercent, 25)} (${fmtTok(tokens ? tokens.currentPromptContextTokens : 0)} / 200k)`);
  L.push(`  Added:  +${fmtTok(contextDelta)} (+${contextDeltaPercent.toFixed(1)}%)`);
  L.push('');

  L.push('  Rate Utilized');
  if (rateLimits) {
    L.push(`  5-Hour:   ${plainBar(rateLimits.fiveHourPercent, 25)}${timeUntil(rateLimits.fiveHourResetsAt)}`);
    if (rateLimits.weeklyPercent != null) {
      L.push(`  Weekly:   ${plainBar(rateLimits.weeklyPercent, 25)}${timeUntil(rateLimits.weeklyResetsAt)}`);
    }
    if (rateLimits.opusWeeklyPercent != null) {
      L.push(`  Opus 7d:  ${plainBar(rateLimits.opusWeeklyPercent, 25)}`);
    }
    if (rateLimits.sonnetWeeklyPercent != null) {
      L.push(`  Snt 7d:   ${plainBar(rateLimits.sonnetWeeklyPercent, 25)}`);
    }
  } else {
    L.push('  (Usage API unavailable - rate limited or auth expired)');
  }
  L.push('────────────────────────────────────────────────────────');

  const output = JSON.stringify({
    continue: false,
    stopReason: L.join('\n'),
  });
  process.stdout.write(output);
  process.exit(0);
}

main().catch(() => process.exit(0));
