const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
let webOutput = "single";

const outputArgIndex = args.findIndex((arg) => arg.startsWith("--web-output="));
if (outputArgIndex >= 0) {
  const value = args[outputArgIndex].split("=")[1];
  if (value) {
    webOutput = value;
  }
  args.splice(outputArgIndex, 1);
}

const env = {
  ...process.env,
  EXPO_WEB_OUTPUT: webOutput,
};

const result = spawnSync("npx", ["expo", ...args], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) {
  // Bubble up launch errors so failures are visible in CI/dev terminals.
  console.error(result.error.message);
}

process.exit(typeof result.status === "number" ? result.status : 1);
