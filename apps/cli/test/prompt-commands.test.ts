import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/main.js";

async function invoke(cwd: string, args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd,
    writeOut: (message) => {
      stdout += message;
    },
    writeErr: (message) => {
      stderr += message;
    },
  });
  return { code, stdout, stderr };
}

describe("llmeval prompt", () => {
  it("runs the create, optimistic save, publish, list, and show lifecycle across restarts", async () => {
    const cwd = join(tmpdir(), `prompt-cli-${crypto.randomUUID()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, "template.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        system: "Be concise.",
        user: "{{input.user}}",
        declaredVariables: [],
      }),
    );
    const created = await invoke(cwd, [
      "prompt",
      "create",
      "--id",
      "support",
      "--name",
      "Support",
      "--template",
      "template.json",
    ]);
    expect(created).toMatchObject({ code: 0, stderr: "" });
    const draftId = (JSON.parse(created.stdout) as { draft: { draftId: string } }).draft.draftId;

    const saved = await invoke(cwd, [
      "prompt",
      "draft",
      "save",
      "--draft",
      draftId,
      "--expected-revision",
      "0",
      "--template",
      "template.json",
    ]);
    expect(JSON.parse(saved.stdout)).toMatchObject({ revision: 1 });
    const stale = await invoke(cwd, [
      "prompt",
      "draft",
      "save",
      "--draft",
      draftId,
      "--expected-revision",
      "0",
      "--template",
      "template.json",
    ]);
    expect(stale).toMatchObject({ code: 2, stderr: "Prompt draft revision is stale.\n" });

    const published = await invoke(cwd, [
      "prompt",
      "publish",
      "--draft",
      draftId,
      "--expected-revision",
      "1",
    ]);
    expect(JSON.parse(published.stdout)).toMatchObject({ promptId: "support", version: 1 });
    const listed = await invoke(cwd, ["prompt", "list"]);
    expect(JSON.parse(listed.stdout).items).toEqual([
      expect.objectContaining({ promptId: "support", latestVersion: 1 }),
    ]);
    const shown = await invoke(cwd, ["prompt", "show", "--id", "support", "--prompt-version", "1"]);
    expect(JSON.parse(shown.stdout)).toMatchObject({ promptId: "support", version: 1 });
    const nextDraft = await invoke(cwd, [
      "prompt",
      "draft",
      "create",
      "--id",
      "support",
      "--parent-version",
      "1",
    ]);
    expect(JSON.parse(nextDraft.stdout)).toMatchObject({
      promptId: "support",
      revision: 0,
      parentVersion: 1,
    });
    const fullPrompt = await invoke(cwd, ["prompt", "show", "--id", "support"]);
    expect(JSON.parse(fullPrompt.stdout)).toMatchObject({
      promptId: "support",
      draft: { revision: 0 },
      versions: [expect.objectContaining({ version: 1 })],
    });
  });

  it("returns stable input and control-plane exit codes without exposing internals", async () => {
    const cwd = join(tmpdir(), `prompt-cli-errors-${crypto.randomUUID()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, "bad.json"), "{not-json");
    const invalid = await invoke(cwd, [
      "prompt",
      "create",
      "--id",
      "unsafe",
      "--name",
      "Unsafe",
      "--template",
      "bad.json",
    ]);
    expect(invalid).toMatchObject({ code: 2, stderr: "Prompt template file is not valid JSON.\n" });
    const escaped = await invoke(cwd, ["prompt", "list", "--database", "../outside.sqlite"]);
    expect(escaped.code).toBe(2);
    expect(escaped.stderr).toBe("PromptOps database path must remain inside the workspace.\n");
  });
});
