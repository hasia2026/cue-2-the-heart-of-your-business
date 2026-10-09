// Build a narrated product-tour video (docs/product-tour.mp4) from docs/screenshots/*.png.
// Narration: Gemini TTS (if GEMINI_API_KEY in .env, natural voice) else Windows SAPI fallback.
// Visuals: Ken Burns zoom/pan + burned-in caption per slide. Assembly: ffmpeg-static.
// Usage: node scripts/build-product-tour.mjs   (or: npm run tour:video)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
const slides = [
  ['landing-hero', 'CUE — The Heart of Your Business', "Welcome to C U E, the heart of your business. An A I operating system that connects the people, knowledge, workflows, and systems that keep a business moving."],
  ['score-result', 'Capture — Business score', "It starts with capture. Answer a few questions about your business, and C U E scores how you operate today."],
  ['dashboard', 'Dashboard — Northgate Auto Group', "The dashboard puts your whole dealership on one screen. Key metrics, alerts, and next actions, all live."],
  ['hvac-dashboard', 'Dashboard — Summit Air HVAC', "And this is Summit Air Heating and Cooling, an H V A C company running the exact same loops, with vocabulary tuned to their trade."],
  ['nav-pulse', 'Pulse', "Pulse keeps you current, surfacing what changed and what needs a decision."],
  ['capture-document-manager', 'Capture — Document manager', "The document manager stores every contract, quote, and form, with share, move, edit, and delete controls, and a full audit trail."],
  ['signals', 'Signals', "C U E watches for signals. Changes in your data that deserve attention before they become problems."],
  ['understand-insights', 'Understand — Insights', "The understand loop turns raw activity into plain language insights you can act on."],
  ['compass', 'Compass', "Compass turns those insights into strategy, pointing your team at the highest leverage moves."],
  ['knowledge', 'Knowledge', "Knowledge keeps your playbooks, procedures, and answers in one searchable place."],
  ['pricing-studio', 'Pricing Studio', "Pricing studio simulates prices and margins, so you see the impact before you commit."],
  ['brand-studio', 'Brand Studio', "Brand studio keeps every message on voice, from quotes to campaigns."],
  ['execute-approvals', 'Execute — Approvals', "The execute loop proposes actions, and waits for your approval. Nothing moves without you."],
  ['pipeline', 'Pipeline', "The pipeline tracker follows every deal from first touch to close, with terms that match your industry."],
  ['pilot-report', 'Pilot report', "Pilot reports summarize exactly what C U E delivered, in numbers you can verify."],
  ['people', 'People', "People manages your team, with owner, admin, and member roles."],
  ['academy', 'Academy', "Academy trains your staff, one short module at a time."],
  ['lab', 'Innovation Lab', "The innovation lab collects ideas, and turns the best ones into experiments."],
  ['ecosystem', 'Ecosystem', "Ecosystem connects the tools you already use."],
  ['settings', 'Settings', "Settings put you in control of your organization, theme, and A I configuration."],
  ['book-call', 'Book a call', "Ready to see it on your own business? Book a call with our team."],
  ['partners', 'CUE Partners', "C U E partners help you roll out across locations. C U E. The heart of your business."],
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
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = 'Kore';

// --- Gemini TTS: returns a WAV file path for the text, or null on failure ---
async function geminiTts(text, outWav, log) {
  const body = {
    contents: [{ parts: [{ text: `Read this narration warmly and at a steady pace:\n\n${text}` }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } },
  };
  let lastErr = '';
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) { lastErr = `HTTP ${res.status} (attempt ${attempt})`; await new Promise(r => setTimeout(r, 12000 * attempt)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json();
      const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part) throw new Error('no audio in response');
      const mime = part.inlineData.mimeType || 'audio/L16;rate=24000';
      const rate = parseInt(/rate=(\d+)/.exec(mime)?.[1] || '24000', 10);
      const pcm = Buffer.from(part.inlineData.data, 'base64');
      // Wrap raw PCM in a minimal WAV header (16-bit mono)
      const header = Buffer.alloc(44);
      header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
      header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
      header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
      header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
      writeFileSync(outWav, Buffer.concat([header, pcm]));
      return true;
    } catch (e) { lastErr = e.message; }
  }
  log(`Gemini TTS failed for a slide (${lastErr})`);
  return false;
}

// --- SAPI fallback (no key needed) ---
function sapiTts(manifest) {
  const psScript = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 1
$slides = Get-Content -Raw '${path.join(workDir, 'slides.json').replace(/'/g, "''")}' | ConvertFrom-Json
foreach ($s2 in $slides) {
  $s.SetOutputToWaveFile($s2.wav)
  $s.Speak($s2.text)
  $s.SetOutputToNull()
}
$s.Dispose()
`;
  writeFileSync(path.join(workDir, 'slides.json'), JSON.stringify(manifest));
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

if (!existsSync(ffmpeg)) { console.error('ffmpeg binary missing — run: npm install --no-save ffmpeg-static'); process.exit(1); }
for (const [id] of slides) {
  const png = path.join(shotsDir, `${id}.png`);
  if (!existsSync(png)) { console.error(`missing screenshot ${png}`); process.exit(1); }
}
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

// 1) Narration
const manifest = slides.map(([, , text], i) => ({ wav: path.join(workDir, `narr-${String(i).padStart(2, '0')}.wav`), text }));
let engine = 'none';
if (GEMINI_KEY) {
  console.log(`Synthesizing narration with Gemini TTS (${TTS_MODEL}, voice ${TTS_VOICE})...`);
  let ok = 0;
  for (let i = 0; i < slides.length; i++) {
    process.stdout.write(`  tts ${i + 1}/${slides.length}\r`);
    if (await geminiTts(slides[i][2], manifest[i].wav, console.error)) ok++;
    // Free tier: 10 requests/min for the TTS model. ~8.5s spacing keeps us at
    // ~7 calls/min so a 22-slide narration never trips the quota.
    if (i < slides.length - 1) await new Promise(r => setTimeout(r, 8500));
  }
  console.log('');
  if (ok === slides.length) engine = 'gemini';
  else console.error(`Gemini TTS only produced ${ok}/${slides.length} clips — falling back to SAPI for all slides.`);
}
if (engine === 'none') {
  console.log('Synthesizing narration with Windows SAPI (set GEMINI_API_KEY in .env for a natural voice)...');
  if (!sapiTts(manifest)) { console.error('SAPI TTS failed'); process.exit(1); }
  engine = 'sapi';
}
for (const m of manifest) if (!existsSync(m.wav)) { console.error(`missing wav ${m.wav}`); process.exit(1); }
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
  const wav = manifest[i].wav;
  const seg = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  const dur = wavDuration(wav) + tail;
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
    '-y', '-i', path.join(shotsDir, `${id}.png`), '-i', wav,
    '-t', (dur + 0.05).toFixed(3),
    '-vf', vf, '-af', 'apad',
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
