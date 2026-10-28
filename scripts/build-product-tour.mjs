// Build a narrated product-tour video (docs/product-tour.mp4) from docs/screenshots/*.png.
// Narration: Gemini TTS (if GEMINI_API_KEY in .env, natural voice) else Windows SAPI fallback.
// Visuals: Ken Burns zoom/pan + burned-in caption per slide. Assembly: ffmpeg-static.
// Usage: node scripts/build-product-tour.mjs   (or: npm run tour:video)
//
// Voice pools use disjoint filenames so nothing ever destroys another engine's clips:
//   .tour-build/gem-NN.wav  — Gemini-synthesized narration (precious: free tier ≈10 req/day)
//   .tour-build/sapi-NN.wav — Windows SAPI narration (regenerated every run, never a loss)
// A gem clip survives between runs, so once the daily TTS pool resets a few more
// slides synthesize until the whole video is Gemini-narrated.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'docs', 'screenshots');
const workDir = path.join(root, '.tour-build');
const outFile = path.join(root, 'docs', 'product-tour.mp4');
const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

// [screenshot id, burned-in caption, narration]
// Narration uses spaced-out letters ("C U E") so every TTS engine spells it as
// individual letters; "Kyoo" gets a SAPI SSML phoneme hint below ("kyoō").
const slides = [
  ['landing-hero', 'CUE — The Heart of Your Business', "Welcome to Kyoo, the heart of your business. An A I operating system that connects the people, knowledge, workflows, and systems that keep a business moving."],
  ['score-result', 'Capture — Business score', "It starts with capture. Answer a few questions about your business, and Kyoo scores how you operate today."],
  ['dashboard', 'Dashboard — Northgate Auto Group', "The dashboard puts your whole dealership on one screen. Key metrics, alerts, and next actions, all live."],
  ['hvac-dashboard', 'Dashboard — Summit Air HVAC', "And this is Summit Air Heating and Cooling, an H V A C company running the exact same loops, with vocabulary tuned to their trade."],
  ['command-bar', 'Command bar — type what you want', "And anywhere in the app, press Command K and type what you want: new job for Summit Air, twelve fifty, replace the heater at 44 22 Cedar Avenue, Friday at nine. No forms, no menus."],
  ['command-draft', 'Command draft — confirm', "CUE reads your sentence, fills in the record, and waits. You check the details, edit anything, and confirm. Nothing is written until you say so."],
  ['nav-pulse', 'Pulse', "Pulse keeps you current, surfacing what changed and what needs a decision."],
  ['capture-document-manager', 'Capture — Document manager', "The document manager stores every contract, quote, and form, with share, move, edit, and delete controls, and a full audit trail."],
  ['signals', 'Signals', "Kyoo watches for signals. Changes in your data that deserve attention before they become problems."],
  ['understand-insights', 'Understand — Insights', "The understand loop turns raw activity into plain language insights you can act on."],
  ['compass', 'Compass', "Compass turns those insights into strategy, pointing your team at the highest leverage moves."],
  ['knowledge', 'Knowledge', "Knowledge keeps your playbooks, procedures, and answers in one searchable place."],
  ['pricing-studio', 'Pricing Studio', "Pricing studio simulates prices and margins, so you see the impact before you commit."],
  ['brand-studio', 'Brand Studio', "Brand studio keeps every message on voice, from quotes to campaigns."],
  ['execute-approvals', 'Execute — Approvals', "The execute loop proposes actions, and waits for your approval. Nothing moves without you."],
  ['pipeline', 'Pipeline', "The pipeline tracker follows every deal from first touch to close, with terms that match your industry."],
  ['property-history', 'Service history by property', "Service history is organized by property. For a client with thirty locations, your techs see just the address they're standing at, and when the next visit is due at that address."],
  ['pilot-report', 'Pilot report', "Pilot reports summarize exactly what Kyoo delivered, in numbers you can verify."],
  ['people', 'People', "People manages your team, with owner, admin, and member roles."],
  ['academy', 'Academy', "Academy trains your staff, one short module at a time."],
  ['lab', 'Innovation Lab', "The innovation lab collects ideas, and turns the best ones into experiments."],
  ['ecosystem', 'Ecosystem', "Ecosystem connects the tools you already use."],
  ['settings', 'Settings', "Settings put you in control of your organization, theme, and A I configuration."],
  ['book-call', 'Book a call', "Ready to see it on your own business? Book a call with our team."],
  ['partners', 'CUE Partners', "Kyoo partners help you roll out across locations. Kyoo. The heart of your business."],
];

function readEnvKey(name) {
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(p, 'utf8'));
    if (m) return m[1].trim();
  }
  return process.env[name] || '';
}

const GEMINI_KEY = readEnvKey('GEMINI_API_KEY');
const TTS_MODEL = 'gemini-3.1-flash-tts-preview'; // 2026-10: flash-tts = 10 req/day free; also try 'gemini-3.8-flash-lite-tts'
const TTS_FALLBACK_MODELS = ['gemini-3.8-flash-lite-tts']; // per-model daily pools; script fails over when one runs dry
const TTS_VOICE = 'Kore';

// --- Gemini TTS: returns a WAV file path for the text, or null on failure ---
async function geminiTts(text, outWav, log) {
  const body = {
    contents: [{ parts: [{ text: `Read this narration warmly and at a steady pace:\n\n${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } },
  };
  const models = [TTS_MODEL, ...TTS_FALLBACK_MODELS];
  let lastErr = '';
  // Hard caps, not slow-bleed: a drained daily pool returns 429 permanently, so
  // generous backoffs just trap the build for hours. Cap ~35s per attempt, and
  // 3 attempts per model pool (2 pools), then fail the slide fast — the repo
  // keeps whichever gem clips landed, the run ends on SAPI and the queue resets
  // for the next day.
  const backoff = [15_000, 30_000, 35_000];
  for (let attempt = 1; attempt <= backoff.length * models.length; attempt++) {
    const model = models[Math.floor((attempt - 1) / backoff.length)];
    try {
      // Bounded requests only: a stalled connection without a timeout wedges the whole build.
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === backoff.length * models.length) { lastErr = `HTTP ${res.status} (all attempts)`; break; }
        lastErr = `HTTP ${res.status} (attempt ${attempt})`;
        await new Promise(r => setTimeout(r, backoff[(attempt - 1) % backoff.length]));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json();
      const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part) throw new Error('no audio in response');
      const mimeType = part.inlineData.mimeType || '';
      // lite-tts returns a complete audio/wav; flash-tts returned raw PCM to wrap.
      if (/audio\/wav/i.test(mimeType)) {
        writeFileSync(outWav, Buffer.from(part.inlineData.data, 'base64'));
      } else {
        const rate = parseInt(/rate=(\d+)/.exec(mimeType)?.[1] || '24000', 10);
        const pcm = Buffer.from(part.inlineData.data, 'base64');
        // Wrap raw PCM in a minimal WAV header (16-bit mono)
        const header = Buffer.alloc(44);
        header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
        header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
        header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
        header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
        header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
        writeFileSync(outWav, Buffer.concat([header, pcm]));
      }
      return true;
    } catch (e) { lastErr = e.message; }
  }
  log(`Gemini TTS failed for a slide (${lastErr})`);
  return false;
}

// --- SAPI fallback (no key needed) ---
// Narration text uses the phonetic "Kyoo" spelling, which SAPI mangles into
// "Kaiwoo"/"Kiowa". Promote each occurrence to an explicit SSML phoneme
// ("k y uw") so the fallback voice says CUE the same way Gemini does.
function toSapiSsml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/Kyoo/g, '<phoneme alphabet="sapi" ph="k y uw">CUE</phoneme>');
  return `<?xml version="1.0"?>\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${esc}</speak>`;
}
function sapiTts(manifest) {
  const ssmls = manifest.map(m => toSapiSsml(m.text));
  const psScript = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 1
$ssmls = Get-Content -Raw '${path.join(workDir, 'ssmls.json').replace(/'/g, "''")}' | ConvertFrom-Json
for ($i = 0; $i -lt $ssmls.Count; $i++) {
  $s.SetOutputToWaveFile($ssmls[$i].wav)
  $s.SpeakSsml($ssmls[$i].ssml)
  $s.SetOutputToNull()
}
$s.Dispose()
`;
  writeFileSync(path.join(workDir, 'ssmls.json'), JSON.stringify(manifest.map((m, i) => ({ wav: m.wav.replace(/\\/g, '/'), ssml: ssmls[i] }))));
  writeFileSync(path.join(workDir, 'tts.ps1'), psScript);
  const ps = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(workDir, 'tts.ps1')], { encoding: 'utf8' });
  return ps.status === 0;
}

function wavDuration(file) {
  const buf = readFileSync(file);
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'data') return size / buf.readUInt32LE(28);
    pos += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

if (!existsSync(ffmpeg)) { console.error('ffmpeg binary missing — run: npm install ffmpeg-static'); process.exit(1); }
for (const [id] of slides) {
  const png = path.join(shotsDir, `${id}.png`);
  if (!existsSync(png)) { console.error(`missing screenshot ${png}`); process.exit(1); }
}
mkdirSync(workDir, { recursive: true });

// Voice clips per slide. gem-NN.wav persists across runs (resume pool: skip a
// slide whose gem clip is valid — every run moves the Gemini-voiced build closer).
const gemClip = (i) => path.join(workDir, `gem-${String(i).padStart(2, '0')}.wav`);
const sapiClip = (i) => path.join(workDir, `sapi-${String(i).padStart(2, '0')}.wav`);
const validWav = (f) => existsSync(f) && wavDuration(f) > 0.5;

// 1) Narration with Gemini, resuming whatever clips previous runs synthesized.
let engine = 'none';
const FORCE_SAPI = process.env.TOUR_FORCE_SAPI === '1';
if (GEMINI_KEY && !FORCE_SAPI) {
  const todo = [];
  for (let i = 0; i < slides.length; i++) if (!validWav(gemClip(i))) todo.push(i);
  if (todo.length < slides.length) console.log(`Resuming: ${slides.length - todo.length}/${slides.length} Gemini clips already on disk.`);
  console.log(`Synthesizing narration with Gemini TTS (${TTS_MODEL}, voice ${TTS_VOICE}), ${todo.length} clip(s) to go...`);
  let ok = slides.length - todo.length;
  let drained = 0; // consecutive slides whose ENTIRE per-pool attempt budget 429'd
  for (const i of todo) {
    process.stdout.write(`  tts ${ok + 1}/${slides.length}\r`);
    const spot = geminiTts(slides[i][2], gemClip(i), console.error);
    if (await spot) { ok++; drained = 0; }
    else if (++drained >= 3) { // every pool hard-429'd 3 slides in a row → pool is dry for today
      console.error(`Quota drained across ${drained} consecutive slides — skipping the remaining ${slides.length - ok} Gemini clips until the pool resets.`);
      break;
    }
    if (i !== todo[todo.length - 1]) await new Promise(r => setTimeout(r, 8500));
  }
  console.log('');
  if (ok === slides.length) engine = 'gemini';
  else console.error(`Gemini TTS only has ${ok}/${slides.length} clips — falling back to SAPI for the whole video (gem clips stay on disk for the next run).`);
}

// Mixed engines never ship: a mid-video voice swap reads as a bug, so until every
// slide has a Gemini clip the video is narrated end-to-end by SAPI. SAPI clips go
// to sapi-NN.wav so they can never overwrite the precious gem clips.
let encode;
if (engine === 'gemini') {
  encode = slides.map((_, i) => gemClip(i));
} else {
  console.log('Synthesizing narration with Windows SAPI (set GEMINI_API_KEY in .env for a natural voice)...');
  encode = slides.map((_, i) => sapiClip(i));
  const sapiManifest = encode.map((wav, i) => ({ wav, text: slides[i][2] }));
  if (!sapiTts(sapiManifest)) { console.error('SAPI TTS failed'); process.exit(1); }
  engine = 'sapi';
}
for (const wav of encode) if (!validWav(wav)) { console.error(`missing wav ${wav}`); process.exit(1); }
console.log(`Narration engine: ${engine}`);

// 2) One ffmpeg segment per slide: Ken Burns motion + burned-in caption
const FONT = String.raw`C\:/Windows/Fonts/segoeuib.ttf`;
function esc(t) { return t.replace(/'/g, "'\\''").replace(/:/g, '\\:'); }
const tail = 0.6;
const listPath = path.join(workDir, 'list.txt');
const lines = [];
let total = 0;
for (let i = 0; i < slides.length; i++) {
  const [id, caption] = slides[i];
  const seg = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  const dur = wavDuration(encode[i]) + tail;
  total += dur;
  const D = Math.ceil(dur * 30);
  // Alternate motion: zoom-in centered / slow pan right / zoom-out centered (upscale first to reduce zoompan jitter)
  const style = i % 3;
  const zoomExpr = style === 0
    ? `z='1+0.12*on/${D}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
    : style === 1
      ? `z='1.10':x='(iw-iw/zoom)*on/${D}':y='(ih-ih/zoom)/2'`
      : `z='1.12-0.12*on/${D}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  const vf = [
    'scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440',
    `zoompan=${zoomExpr}:d=${D}:s=1280x720:fps=30`,
    `drawtext=fontfile='${FONT}':text='${esc(caption)}':fontsize=34:fontcolor=white:borderw=3:bordercolor=black@0.7:x=(w-text_w)/2:y=h-70`,
    'format=yuv420p',
  ].join(',');
  execFileSync(ffmpeg, [
    '-y', '-i', path.join(shotsDir, `${id}.png`), '-i', encode[i],
    '-t', (dur + 0.05).toFixed(3),
    '-vf', vf, '-af', 'apad',
    // Normalize audio: pools mix sample rates (Gemini 24k/SAPI 16k), and the
    // concat demuxer with -c copy needs matching audio parameters throughout.
    '-ar', '44100',
    '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', seg,
  ], { stdio: 'pipe' });
  lines.push(`file '${seg.replace(/\\/g, '/')}'`);
  console.log(`segment ${i + 1}/${slides.length}: ${id} (${dur.toFixed(1)}s)`);
}
writeFileSync(listPath, lines.join('\n'));

// 3) Concat
execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outFile], { stdio: 'pipe' });
const mb = (statSync(outFile).size / 1048576).toFixed(1);
console.log(`DONE docs/product-tour.mp4 — ${slides.length} slides, ~${Math.round(total)}s, ${mb} MB, voice=${engine}`);
