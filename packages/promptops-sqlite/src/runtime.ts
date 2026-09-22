const MINIMUM_NODE_VERSION = [22, 13, 0] as const;

function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(version);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isPromptOpsRuntimeSupported(version: string): boolean {
  const parsed = parseVersion(version);
  if (parsed === undefined) return false;
  for (let index = 0; index < MINIMUM_NODE_VERSION.length; index += 1) {
    const part = parsed[index]!;
    const minimum = MINIMUM_NODE_VERSION[index]!;
    if (part > minimum) return true;
    if (part < minimum) return false;
  }
  return true;
}

export function assertPromptOpsRuntime(version = process.versions.node): void {
  if (!isPromptOpsRuntimeSupported(version)) {
    throw new Error(
      `PromptOps SQLite requires Node.js >=22.13.0; current runtime is ${version}. Upgrade Node.js before opening the PromptOps database.`,
    );
  }
}
