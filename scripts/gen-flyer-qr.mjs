#!/usr/bin/env node
// Splices a fresh QR code (pointing at APP_URL + /scan) into both
// print flyers, replacing the __QR_DATA_URI_PLACEHOLDER__ token. Re-run
// after changing the scan page or the deployment URL:
//   node --env-file=.env scripts/gen-flyer-qr.mjs [base-url]
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

const argUrl = process.argv[2];
const APP_URL = (argUrl || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const target = `${APP_URL}/scan`;

console.error("target url:", target);

const dataUri = await QRCode.toDataURL(target, {
  width: 1024,
  margin: 1,
  color: { dark: "#1E1B3AFF", light: "#FFFFFFFF" },
});

const flyers = ["docs/flyer-hvac.html", "docs/flyer-dealership.html"];
for (const f of flyers) {
  let html = readFileSync(f, "utf8");
  const marker = /<img src="data:image\/png;base64,__QR_DATA_URI_PLACEHOLDER__" alt="QR code — book the free 20-minute CUE scan call">/;
  // Idempotent re-runs: also accept a previously spliced QR so the URL can
  // be updated without hand-reverting the file.
  const prior = /<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="QR code — book the free 20-minute CUE scan call">/;
  // A stale base64 image may exceed the regex safely; find by alt attribute.
  const stale = /<img src="[^"]*" alt="QR code — book the free 20-minute CUE scan call">/;
  if (!marker.test(html) && !stale.test(html)) {
    console.error(`${f}: no QR img tag with the scan-call alt attribute found — skipped`);
    continue;
  }
  html = html.replace(stale, `<img src="${dataUri}" alt="QR code — book the free 20-minute CUE scan call">`);
  writeFileSync(f, html);
  console.error(`${f}: QR updated → ${target}`);
}
console.error("done");
