import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve("apps/cli/dist/index.js");
const config = resolve("examples/ecommerce-support/llmeval.config.json");
const suite = resolve("examples/ecommerce-support/suite.yaml");

function run(fixtures, extra = []) {
  return spawnSync(
    process.execPath,
    [cli, "run", "--config", config, "--suite", suite, "--fixtures", resolve(fixtures), ...extra],
    { encoding: "utf8" },
  );
}

const passing = run("examples/ecommerce-support/fixtures.json");
if (passing.status !== 0 || !passing.stdout.includes("Cases: 64 passed")) {
  process.stderr.write(passing.stdout);
  process.stderr.write(passing.stderr);
  throw new Error(`Portfolio pass demo failed with exit ${passing.status}.`);
}
console.log("Portfolio pass demo PASSED: 64/64 cases, exit 0.");

const regression = run("examples/ecommerce-support/fixtures-regression.json", [
  "--case",
  "REFUND_001",
]);
if (regression.status !== 1 || !regression.stdout.includes("Status: QUALITY_FAILED")) {
  process.stderr.write(regression.stdout);
  process.stderr.write(regression.stderr);
  throw new Error(`Critical regression evidence expected exit 1, received ${regression.status}.`);
}
console.log("Critical regression demo PASSED: REFUND_001 blocked with exit 1.");
