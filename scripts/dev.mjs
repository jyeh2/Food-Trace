import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";

const require = createRequire(import.meta.url);
const port = Number(process.env.PORT ?? 3000);
const children = new Set();
let stopping = false;
let started = false;
let timer;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 5000);
  force.unref();
}

function launch(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.add(child);
  child.on("error", (error) => {
    console.error(`Could not start ${command}: ${error.message}`);
    if (command === "ngrok") console.error("Install ngrok and configure its auth token first. See README.md.");
    children.delete(child);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 1);
  });
  return child;
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

// Refuse to tunnel an unrelated server or let Next silently switch ports.
try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, () => probe.close(resolve));
  });
  console.log("Starting public ngrok demo tunnel. Ctrl+C stops both processes.");
  const tunnel = launch("ngrok", ["http", `http://localhost:${port}`, "--log=stdout", "--log-format=json"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  timer = setTimeout(() => {
    console.error("ngrok did not provide an HTTPS URL within 30 seconds. Check its account/auth-token setup.");
    stop(1);
  }, 30000);
  createInterface({ input: tunnel.stdout }).on("line", (line) => {
    let event;
    try { event = JSON.parse(line); } catch { console.log(line); return; }
    if (event.lvl === "eror" || event.lvl === "error") console.error(event.msg, event.err ?? "");
    if (stopping || started || event.msg !== "started tunnel" || !event.url?.startsWith("https://")) return;
    started = true;
    clearTimeout(timer);
    console.log(`\nDemo URL: ${event.url}\niPhone camera: ${event.url}/scan\n`);
    launch(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port)], {
      env: {
        ...process.env,
        NEXT_PUBLIC_BASE_URL: event.url,
        DEV_ALLOWED_ORIGINS: [process.env.DEV_ALLOWED_ORIGINS, new URL(event.url).hostname].filter(Boolean).join(","),
      },
    });
  });
} catch (error) {
  console.error(`Cannot start on port ${port}: ${error.message}. Stop the existing server or set PORT.`);
  stop(1);
}
