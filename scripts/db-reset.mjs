#!/usr/bin/env node
// Destructive reset: db-setup --fresh, then the dealership demo seed.
// db-setup refuses non-local targets unless --confirm-fresh is forwarded.
import { spawnSync } from "node:child_process";

const confirm = process.argv.includes("--confirm-fresh");
const setup = spawnSync(
  process.execPath,
  ["scripts/db-setup.mjs", "--fresh", ...(confirm ? ["--confirm-fresh"] : [])],
  { stdio: "inherit" },
);
if (setup.status !== 0) process.exit(setup.status ?? 1);

const seed = spawnSync(process.execPath, ["scripts/seed-dealership.mjs"], {
  stdio: "inherit",
});
process.exit(seed.status ?? 1);
