import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(path)
        : Promise.resolve(path.endsWith(".ts") ? [path] : []);
    }),
  );
  return nested.flat();
}

describe("PromptOps package boundary", () => {
  it("does not import adapters, HTTP, React, filesystem, or provider SDKs", async () => {
    const files = await sourceFiles(join(process.cwd(), "packages/promptops/src"));
    const forbidden = [
      "node:sqlite",
      "node:fs",
      "node:path",
      "fastify",
      "react",
      "@llm-eval-kit/providers",
      "@llm-eval-kit/promptops-sqlite",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const dependency of forbidden) expect(source).not.toContain(`from "${dependency}`);
    }
  });
});
