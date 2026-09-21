import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [
  spawn(command, ["studio:api"], { stdio: "inherit" }),
  spawn(command, ["studio:web"], { stdio: "inherit" }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of children) {
  child.once("error", () => close(1));
  child.once("exit", (code, signal) => {
    if (!closing && signal === null && code !== 0) close(code ?? 1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => close());
}
