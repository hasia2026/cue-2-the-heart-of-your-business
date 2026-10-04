/** Prints only the HOST:PORT of the configured DATABASE_URL/DIRECT_URL — never credentials. */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) { console.log("NO .env FILE"); process.exit(0); }
const env = fs.readFileSync(envPath, "utf8");

function hostOf(name) {
  const m = env.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
  if (!m) return "(not set)";
  try {
    const u = new URL(m[1].trim());
    return `${u.hostname}:${u.port || 5432}${u.search || ""}`;
  } catch {
    return "(unparseable — check format)";
  }
}

console.log("DATABASE_URL →", hostOf("DATABASE_URL"));
console.log("DIRECT_URL   →", hostOf("DIRECT_URL"));
