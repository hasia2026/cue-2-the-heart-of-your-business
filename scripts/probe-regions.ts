/** Probes Supabase session pooler endpoints: TCP connect + tersely reports. */
import { createConnection } from "net";

const HOSTS = ["us-west-1", "us-west-2", "us-east-1", "us-east-2", "eu-central-1", "eu-west-1", "eu-west-2", "eu-north-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-south-1", "sa-east-1"];

function probe(host: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: `aws-0-${host}.pooler.supabase.com`, port: 5432, timeout: 6000 });
    socket.on("connect", () => { socket.destroy(); resolve(host); });
    socket.on("error", () => resolve(""));
    socket.on("timeout", () => { socket.destroy(); resolve(""); });
  });
}

async function main() {
  const ok = (await Promise.all(HOSTS.map(probe))).filter(Boolean);
  console.log(ok.length ? `TCP-reachable pooler regions: ${ok.join(", ")}` : "no pooler regions reachable");
}
main();
