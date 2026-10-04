#!/usr/bin/env node
/**
 * scan-tracked-secrets.cjs — pre-commit/pre-push secret guard for CUE.
 *
 * Run AFTER `git add` (it scans the git INDEX, i.e. exactly what would be
 * committed):   npm run test:secrets
 *
 * It looks for:
 *   1. real secret values from `.env` — opaque tokens (session secret, DB
 *      password) and passwords embedded inside connection-string URLs
 *   2. structural patterns: JWT-shaped tokens (Supabase anon/service keys),
 *      PEM private keys, postgres URLs with embedded credentials, and common
 *      API-key prefixes (sk_/ghp_/sbp_/github_pat_/re_)
 *
 * Placeholder examples (DEPLOY.md, .env.example) are recognized and skipped.
 * On success prints CLEAN and exits 0. On any finding it prints ONLY file
 * names and which pattern matched — never the secret values — and exits 1.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** List staged files whose content matches the pattern. [] = no matches. */
function gitGrepFiles(pattern, fixed) {
  const args = ['grep', '--cached', '-I', '-l', fixed ? '-F' : '-E', '--', pattern];
  try {
    return git(args).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // exit code 1 = no matches
    throw e;
  }
}

/** Matched substrings (POSIX ERE, via git grep -o) within one staged file. */
function gitGrepMatches(pattern, file) {
  const args = ['grep', '--cached', '-I', '-o', '-h', '-E', '--', pattern, '--', file];
  try {
    return git(args).split(/\r?\n/).filter(Boolean);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

// --- 1. Candidate secrets from .env (values are never printed) -----------
const envCandidates = [];
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    const hasCreds = /\/\/[^:/@\s]+:[^@\s]+@/.test(v); // URL with user:pass
    const isOpaqueToken = v.length >= 24 && /^[A-Za-z0-9+/=_-]+$/.test(v); // hex/b64 token
    if (!hasCreds && !isOpaqueToken) continue; // public URLs, flags, etc. are not secrets
    envCandidates.push({ name: `.env:${m[1]}`, value: v });
    const cred = v.match(/^[a-z]+:\/\/[^:/@\s]+:([^@\s]+)@/); // password inside the URL
    if (cred && cred[1].length >= 8) {
      envCandidates.push({ name: `.env:${m[1]} (embedded password)`, value: cred[1] });
    }
  }
}

// --- 2. Structural patterns ----------------------------------------------
const PLACEHOLDER = /<|\[|your[._-]?password|changeme|placeholder|\bexample\b|\$\{/i;
const patterns = [
  { name: 'JWT-shaped token (e.g. Supabase anon/service key)', re: 'eyJ[A-Za-z0-9_-]{30,}' },
  { name: 'PEM private key block', re: '-----BEGIN [A-Z ]*PRIVATE KEY' },
  { name: 'postgres URL with embedded credentials', re: "postgres(ql)?://[^@[[:space:]\"']+:[^@[[:space:]\"']+@" },
  { name: 'API-key prefix (sk_/ghp_/gho_/sbp_/github_pat_)', re: '(sk|ghp|gho|sbp|github_pat)_[A-Za-z0-9_-]{16,}' },
  { name: 'Resend-style API key (re_)', re: 're_[A-Za-z0-9]{20,}' },
];

let findings = 0;

for (const { name, value } of envCandidates) {
  const files = gitGrepFiles(value, true);
  if (files.length) {
    findings++;
    console.log(`SECRET LEAK — ${name} appears in staged file(s):`);
    files.forEach((f) => console.log(`  ${f}`));
  }
}

for (const { name, re } of patterns) {
  const files = gitGrepFiles(re, false);
  if (!files.length) continue;
  const kept = files.filter((f) => {
    const hits = gitGrepMatches(re, f);
    return !hits.every((h) => PLACEHOLDER.test(h)); // keep file if >=1 real hit
  });
  if (kept.length) {
    findings++;
    console.log(`PATTERN MATCH — ${name}:`);
    kept.forEach((f) => console.log(`  ${f}`));
  }
}

if (findings === 0) {
  console.log(
    `CLEAN — no secrets in staged files (checked ${envCandidates.length} .env value(s) + ${patterns.length} structural patterns).`
  );
} else {
  console.log(`\n${findings} finding(s) — resolve before committing/pushing (git rm --cached <file>, then re-scan).`);
  process.exit(1);
}
