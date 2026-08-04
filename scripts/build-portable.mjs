import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vinext.cmd" : "vinext");

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(binary, ["build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exit(exitCode);
await import("./validate-artifact.mjs");
