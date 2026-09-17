/* global fetch */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const startedAt = performance.now();
const child = spawn(process.execPath, ["apps/studio-api/dist/cli.js"], {
  cwd: root,
  env: { ...process.env, LLMEVAL_STUDIO_ASSETS: "apps/studio-web/dist" },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

async function waitForHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Studio exited early.\n${stderr}`);
    try {
      const response = await fetch("http://127.0.0.1:4317/health");
      if (response.ok) return performance.now() - startedAt;
    } catch {
      // The loopback listener is not ready yet.
    }
    await delay(20);
  }
  throw new Error(`Studio did not become ready.\n${stdout}\n${stderr}`);
}

try {
  const startupMs = await waitForHealth();
  if (startupMs > 2_000) throw new Error(`Startup exceeded 2000 ms: ${startupMs.toFixed(0)} ms`);
  const page = await fetch("http://127.0.0.1:4317/", { headers: { accept: "text/html" } });
  const html = await page.text();
  if (!page.ok || !html.includes('<div id="root"></div>')) {
    throw new Error("Production index was not served from the loopback origin.");
  }
  if (!stdout.includes("Mode: production") || !stdout.includes("127.0.0.1:4317")) {
    throw new Error(`Startup metadata was incomplete.\n${stdout}`);
  }
  process.stdout.write(`Studio production smoke passed in ${startupMs.toFixed(0)} ms.\n`);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolveExit) => child.once("exit", resolveExit));
}
