#!/usr/bin/env node
// Generates docs/one-pager-qr.png — a QR code pointing at the CUE landing
// page, embedded in the printable one-pager (docs/one-pager-leave-behind.html).
// Re-run if APP_URL changes or the sheet moves. Usage:
//   node --env-file=.env scripts/gen-one-pager-qr.mjs
import { writeFileSync } from "node:fs";
// Vendored in node_modules; dependency install is one-time (dev-only dep).
import QRCode from "qrcode";

const APP_URL = process.env.APP_URL || "http://localhost:3210";
// The landing page of the CUE app is /signup by default; /signup carries the
// "Create your company" entry that kicks off the free trial.
const target = APP_URL.replace(/\/$/, "") + "/signup";

await QRCode.toFile("docs/one-pager-qr.png", target, {
  width: 1024,
  margin: 1,
  color: { dark: "#1E1B3AFF", light: "#FFFFFFFF" },
});
console.log(`docs/one-pager-qr.png → ${target}`);
