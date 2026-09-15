import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const suite = await readFile(resolve("examples/ecommerce-support/suite.yaml"), "utf8");
const fixtures = JSON.parse(
  await readFile(resolve("examples/ecommerce-support/fixtures.json"), "utf8"),
);
const requiredDocs = [
  "docs/ARCHITECTURE.md",
  "docs/LIMITATIONS.md",
  "docs/ROI.md",
  "docs/RELEASE_CHECKLIST.md",
];

if (packageJson.version !== "0.1.0") throw new Error("Release version must be 0.1.0.");
if (Object.keys(fixtures.fixtures).length < 50)
  throw new Error("Portfolio fixture count must be at least 50.");
if (!suite.includes("REFUND_001") || !suite.includes("SAFETY_008"))
  throw new Error("Portfolio suite is incomplete.");
for (const path of requiredDocs) await readFile(resolve(path), "utf8");

console.log("Static release checks PASSED for v0.1.0.");
