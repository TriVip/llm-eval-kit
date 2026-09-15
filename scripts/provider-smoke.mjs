import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const providers = [
  { id: "openai", key: "OPENAI_API_KEY", model: "OPENAI_SMOKE_MODEL" },
  { id: "gemini", key: "GEMINI_API_KEY", model: "GEMINI_SMOKE_MODEL" },
];
const templatePath = resolve("examples/ecommerce-support/llmeval.config.json");
const suitePath = resolve("examples/ecommerce-support/suite.yaml");
const cliPath = resolve("apps/cli/dist/index.js");
let executed = 0;

for (const provider of providers) {
  if (!process.env[provider.key] || !process.env[provider.model]) {
    console.log(
      `SKIP ${provider.id}: set ${provider.key} and ${provider.model} to run live smoke.`,
    );
    continue;
  }

  const directory = await mkdtemp(join(tmpdir(), `llmeval-${provider.id}-`));
  try {
    const config = JSON.parse(await readFile(templatePath, "utf8"));
    config.target = {
      provider: provider.id,
      model: process.env[provider.model],
      apiKeyEnv: provider.key,
      temperature: 0,
      maxOutputTokens: 128,
    };
    config.output = {
      directory: join(directory, "reports"),
      formats: ["json"],
      retainRawResponses: false,
    };
    const configPath = join(directory, "config.json");
    await writeFile(configPath, JSON.stringify(config), { encoding: "utf8", mode: 0o600 });

    const result = spawnSync(
      process.execPath,
      [cliPath, "run", "--config", configPath, "--suite", suitePath, "--case", "REFUND_001"],
      { stdio: "inherit", env: process.env },
    );
    if (result.status !== 0) process.exitCode = result.status ?? 2;
    executed += 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (executed === 0)
  console.log(
    "Provider smoke policy PASSED: no paid credentials were present; mock CI remains authoritative.",
  );
