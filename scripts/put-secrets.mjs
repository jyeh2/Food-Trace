#!/usr/bin/env node
/**
 * Upload Worker secrets from .env.local (and keypair file if needed).
 *
 * Usage:
 *   pnpm secrets:put
 *   pnpm secrets:put --env .env.production.local
 *   pnpm secrets:put --dry-run
 *
 * NEXT_PUBLIC_* vars are skipped (inlined at build time, not Worker secrets).
 * SERVER_KEYPAIR_PATH is expanded into SERVER_KEYPAIR_JSON for Workers.
 * SOLANA_RPC_URL: do not use public api.*.solana.com on Workers (403).
 * Default in app code is MagicBlock keyless devnet.
 *
 * Wrangler auto-loads .env.local from cwd; D1 API tokens there often lack
 * Workers Secrets permissions. We run `secret put` from a temp dir with a
 * minimal wrangler.toml so OAuth login is used instead.
 */
import { spawn } from "node:child_process";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(root, "node_modules", ".bin", "wrangler");

const SECRET_KEYS = [
  "SOLANA_RPC_URL",
  "SOLANA_CLUSTER",
  "SERVER_KEYPAIR_JSON",
  "SERVER_KEYPAIRS_JSON",
  "STATION_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_D1_DATABASE_ID",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
  "R2_PUBLIC_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "IFM_API_KEY",
  "IFM_MODEL",
];

function parseArgs(argv) {
  let envFile = ".env.local";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--env" || a === "-e") {
      envFile = argv[++i];
      if (!envFile) throw new Error("--env requires a path");
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/put-secrets.mjs [--env FILE] [--dry-run]`);
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return { envFile, dryRun };
}

/** Minimal .env parser: KEY=VALUE, strips quotes, ignores comments/blank. */
function parseEnvFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readWorkerIdentity() {
  const toml = readFileSync(path.join(root, "wrangler.toml"), "utf8");
  const name = toml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  const accountId = toml.match(/^\s*account_id\s*=\s*"([^"]+)"/m)?.[1];
  const compatibilityDate =
    toml.match(/^\s*compatibility_date\s*=\s*"([^"]+)"/m)?.[1] ?? "2026-09-12";
  if (!name) throw new Error("wrangler.toml missing name");
  return { name, accountId, compatibilityDate };
}

function resolveKeypairJson(env) {
  if (env.SERVER_KEYPAIR_JSON?.trim()) return env.SERVER_KEYPAIR_JSON.trim();
  const rel = env.SERVER_KEYPAIR_PATH?.trim() || ".keys/server.json";
  const abs = path.resolve(root, rel);
  if (!existsSync(abs)) {
    throw new Error(
      `missing SERVER_KEYPAIR_JSON and keypair file not found: ${abs}`,
    );
  }
  const raw = readFileSync(abs, "utf8").trim();
  JSON.parse(raw); // validate
  return raw;
}

function putSecret(name, value, wranglerEnv, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(wranglerBin, ["secret", "put", name], {
      cwd,
      stdio: ["pipe", "inherit", "inherit"],
      env: wranglerEnv,
    });
    child.stdin.write(value);
    child.stdin.end();
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler secret put ${name} exited ${code}`));
    });
  });
}

async function main() {
  const { envFile, dryRun } = parseArgs(process.argv.slice(2));
  const absEnv = path.resolve(root, envFile);
  if (!existsSync(absEnv)) {
    console.error(`env file not found: ${absEnv}`);
    process.exit(1);
  }

  const env = parseEnvFile(absEnv);
  env.SERVER_KEYPAIR_JSON = resolveKeypairJson(env);

  const worker = readWorkerIdentity();
  const accountId =
    env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    env.R2_ACCOUNT_ID?.trim() ||
    worker.accountId;
  // App D1 tokens often lack memberships:read; use `wrangler login` OAuth instead.
  const wranglerEnv = { ...process.env };
  delete wranglerEnv.CLOUDFLARE_API_TOKEN;
  delete wranglerEnv.CLOUDFLARE_API_KEY;
  if (accountId) wranglerEnv.CLOUDFLARE_ACCOUNT_ID = accountId;

  const skippedPublic = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_"));
  if (skippedPublic.length) {
    console.log(
      `skipping build-time vars (set when deploying): ${skippedPublic.join(", ")}`,
    );
  }

  const toPut = [];
  for (const key of SECRET_KEYS) {
    const value = env[key]?.trim();
    if (!value) {
      console.log(`skip ${key} (empty)`);
      continue;
    }
    toPut.push([key, value]);
  }

  if (!toPut.length) {
    console.error("nothing to upload");
    process.exit(1);
  }

  if (accountId) console.log(`using account_id ${accountId}`);
  else {
    console.warn(
      "warning: no CLOUDFLARE_ACCOUNT_ID / R2_ACCOUNT_ID in env file — wrangler may fail account lookup",
    );
  }

  console.log(`${dryRun ? "would put" : "putting"} ${toPut.length} secret(s):`);
  for (const [key] of toPut) console.log(`  ${key}`);

  const rpc = env.SOLANA_RPC_URL?.trim() ?? "";
  if (/api\.(devnet|testnet|mainnet-beta)\.solana\.com/i.test(rpc)) {
    console.warn(
      "warning: SOLANA_RPC_URL is a public Solana endpoint — Cloudflare Workers get 403. Use https://rpc.magicblock.app/devnet or Helius/QuickNode.",
    );
  }

  if (dryRun) return;

  const staging = mkdtempSync(path.join(tmpdir(), "foodtrace-secrets-"));
  try {
    writeFileSync(
      path.join(staging, "wrangler.toml"),
      [
        `name = "${worker.name}"`,
        `main = "worker.js"`,
        `compatibility_date = "${worker.compatibilityDate}"`,
        accountId ? `account_id = "${accountId}"` : "",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    writeFileSync(
      path.join(staging, "worker.js"),
      "export default { async fetch() { return new Response('ok'); } };\n",
    );

    for (const [key, value] of toPut) {
      process.stdout.write(`→ ${key} ... `);
      await putSecret(key, value, wranglerEnv, staging);
      console.log("ok");
    }
    console.log("done");
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
