import { spawn } from "node:child_process";
const args = process.argv.slice(2),
  value = (key, fallback) =>
    args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const child = spawn(
  process.execPath,
  [
    "node_modules/webpack-cli/bin/cli.js",
    "serve",
    "--mode",
    "development",
    "--host",
    value("--host", "localhost"),
    "--port",
    value("--port", "3000"),
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
