import { spawnSync } from "node:child_process";
const run = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "firebase-tools@13.35.1",
    "emulators:exec",
    "--only",
    "firestore,auth",
    "--project",
    "demo-rekreo",
    "node tests/firestore.integration.mjs",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      GCLOUD_PROJECT: "demo-rekreo",
    },
  },
);
if (run.error) console.error(run.error.message);
process.exit(run.status ?? 1);
