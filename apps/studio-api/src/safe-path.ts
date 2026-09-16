import { realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

import { ConfigurationError } from "@llm-eval-kit/core";

export async function canonicalRoot(path: string): Promise<string> {
  const root = await realpath(resolve(path)).catch(() => undefined);
  if (root === undefined) throw new ConfigurationError("Configured Studio root is unavailable.");
  if (!(await stat(root)).isDirectory()) {
    throw new ConfigurationError("Configured Studio root must be a directory.");
  }
  return root;
}

export function isContained(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return (
    child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !child.startsWith(sep))
  );
}

export async function containedFile(
  root: string,
  path: string,
  extensions: ReadonlySet<string>,
): Promise<string> {
  const candidate = await realpath(resolve(path)).catch(() => undefined);
  if (candidate === undefined || !isContained(root, candidate)) {
    throw new ConfigurationError("Studio resource is outside its configured root.");
  }
  if (!extensions.has(extname(candidate).toLowerCase()) || !(await stat(candidate)).isFile()) {
    throw new ConfigurationError("Studio resource type is not allowed.");
  }
  return candidate;
}
