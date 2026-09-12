import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SOLANA_RPC_URL, loadServerSecretKey } from "./solana";

describe("loadServerSecretKey", () => {
  const prevJson = process.env.SERVER_KEYPAIR_JSON;
  const prevPath = process.env.SERVER_KEYPAIR_PATH;

  afterEach(() => {
    if (prevJson === undefined) delete process.env.SERVER_KEYPAIR_JSON;
    else process.env.SERVER_KEYPAIR_JSON = prevJson;
    if (prevPath === undefined) delete process.env.SERVER_KEYPAIR_PATH;
    else process.env.SERVER_KEYPAIR_PATH = prevPath;
  });

  it("reads SERVER_KEYPAIR_JSON when set (Workers)", () => {
    process.env.SERVER_KEYPAIR_JSON = "[1,2,3,4]";
    delete process.env.SERVER_KEYPAIR_PATH;
    expect(Array.from(loadServerSecretKey())).toEqual([1, 2, 3, 4]);
  });
});

describe("DEFAULT_SOLANA_RPC_URL", () => {
  it("avoids public Solana endpoints that 403 on Cloudflare Workers", () => {
    expect(DEFAULT_SOLANA_RPC_URL).not.toMatch(/api\.(devnet|testnet|mainnet-beta)\.solana\.com/i);
    expect(DEFAULT_SOLANA_RPC_URL).toMatch(/^https:\/\//);
  });
});
