// Build a narrated product-tour video (docs/product-tour.mp4) from docs/screenshots/*.png.
// Narration: Windows SAPI text-to-speech (no API key needed). Assembly: ffmpeg-static.
// Usage: node scripts/build-product-tour.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'docs', 'screenshots');
const workDir = path.join(root, '.tour-build');
const outFile = path.join(root, 'docs', 'product-tour.mp4');
const ffmpeg = require('ffmpeg-static');

const slides = [
  ['landing-hero', "Welcome to C U E, the heart of your business. An A I operating system that connects the people, knowledge, workflows, and systems that keep a business moving."],
  ['score-result', "It starts with capture. Answer a few questions about your business, and C U E scores how you operate today."],
  ['dashboard', "The dashboard puts your whole dealership on one screen. Key metrics, alerts, and next actions, all live."],
  ['hvac-dashboard', "And this is Summit Air Heating and Cooling, an H V A C company running the exact same loops, with vocabulary tuned to their trade."],
  ['nav-pulse', "Pulse keeps you current, surfacing what changed and what needs a decision."],
  ['capture-document-manager', "The document manager stores every contract, quote, and form, with share, move, edit, and delete controls, and a full audit trail."],
  ['signals', "C U E watches for signals. Changes in your data that deserve attention before they become problems."],
  ['understand-insights', "The understand loop turns raw activity into plain language insights you can act on."],
  ['compass', "Compass turns those insights into strategy, pointing your team at the highest leverage moves."],
  ['knowledge', "Knowledge keeps your playbooks, procedures, and answers in one searchable place."],
  ['pricing-studio', "Pricing studio simulates prices and margins, so you see the impact before you commit."],
  ['brand-studio', "Brand studio keeps every message on voice, from quotes to campaigns."],
  ['execute-approvals', "The execute loop proposes actions, and waits for your approval. Nothing moves without you."],
  ['pipeline', "The pipeline tracker follows every deal from first touch to close, with terms that match your industry."],
  ['pilot-report', "Pilot reports summarize exactly what C U E delivered, in numbers you can verify."],
  ['people', "People manages your team, with owner, admin, and member roles."],
  ['academy', "Academy trains your staff, one short module at a time."],
  ['lab', "The innovation lab collects ideas, and turns the best ones into experiments."],
  ['ecosystem', "Ecosystem connects the tools you already use."],
  ['settings', "Settings put you in control of your organization, theme, and A I configuration."],
  ['book-call', "Ready to see it on your own business? Book a call with our team."],
  ['partners', "C U E partners help you roll out across locations. C U E. The heart of your business."],
];

// require() shim for ESM
function require(id) {
  return createRequire(import.meta.url)(id);
}
import { createRequire } from 'node:module';

if (!existsSync(ffmpeg)) { console.error('ffmpeg binary missing'); process.exit(1); }
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

// 1) TTS: one PowerShell invocation generating all WAVs
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
writeFileSync(path.join(workDir, 'slides.json'), JSON.stringify(slides.map(([id, text]) => ({ wav: path.join(workDir, `${id}.wav`), text }))));
writeFileSync(path.join(workDir, 'tts.ps1'), psScript);
console.log('Synthesizing narration with Windows SAPI...');
const ps = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(workDir, 'tts.ps1')], { encoding: 'utf8' });
if (ps.status !== 0) { console.error('TTS failed:', ps.stderr); process.exit(1); }
for (const [id] of slides) if (!existsSync(path.join(workDir, `${id}.wav`))) { console.error(`missing wav for ${id}`); process.exit(1); }

// 2) Parse WAV durations (PCM header: byte rate at offset 28, data size from last chunk)
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

// 3) One ffmpeg segment per slide (1280x720, silent pad to audio end + 0.6s)
const tail = 0.6;
const listPath = path.join(workDir, 'list.txt');
const lines = [];
let total = 0;
slides.forEach(([id], i) => {
  const wav = path.join(workDir, `${id}.wav`);
  const seg = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  const dur = wavDuration(wav) + tail;
  total += dur;
  execFileSync(ffmpeg, [
    '-y', '-loop', '1', '-framerate', '30', '-i', path.join(shotsDir, `${id}.png`), '-i', wav,
    '-t', dur.toFixed(3),
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
    '-af', 'apad',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', seg,
  ], { stdio: 'pipe' });
  lines.push(`file '${seg.replace(/\\/g, '/')}'`);
  console.log(`segment ${i + 1}/${slides.length}: ${id} (${dur.toFixed(1)}s)`);
});
writeFileSync(listPath, lines.join('\n'));

// 4) Concat
execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outFile], { stdio: 'pipe' });
const mb = (statSync(outFile).size / 1048576).toFixed(1);
console.log(`DONE docs/product-tour.mp4 — ${slides.length} slides, ~${Math.round(total)}s, ${mb} MB`);
