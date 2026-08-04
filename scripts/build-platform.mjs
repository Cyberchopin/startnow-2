import { spawnSync } from "node:child_process";

const isVercel = process.env.VERCEL === "1";
const command = isVercel ? "next" : "bash";
const args = isVercel ? ["build"] : ["scripts/build-verified.sh"];

console.log(`Building Start Now for ${isVercel ? "Vercel" : "ChatGPT Sites"}...`);

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
