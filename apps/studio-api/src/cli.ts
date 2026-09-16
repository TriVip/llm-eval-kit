#!/usr/bin/env node
import { resolve } from "node:path";

import { startStudioServer } from "./server.js";

const workspaceRoot = resolve(process.env.LLMEVAL_WORKSPACE_ROOT ?? process.cwd());
const reportRoot = resolve(process.env.LLMEVAL_REPORT_ROOT ?? "reports");
const webOrigin = process.env.LLMEVAL_STUDIO_ORIGIN ?? "http://127.0.0.1:4173";
const apiPort = 4317;
const { server, url } = await startStudioServer({
  workspaceRoot,
  reportRoot,
  port: apiPort,
  origin: webOrigin,
  allowedHosts: [new URL(webOrigin).host, `127.0.0.1:${apiPort}`, `localhost:${apiPort}`],
});

process.stdout.write(
  `LLM Eval Studio API: ${url}\nWorkspace: ${workspaceRoot}\nReport root: ${reportRoot}\n`,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}
