import { afterEach, describe, expect, it } from "vitest";
import type { Umi } from "@metaplex-foundation/umi";
import {
  DEFAULT_SOLANA_RPC_URL,
  isBlockhashExpiredError,
  loadServerSecretKey,
  loadServerSecretKeys,
  sendWithBlockhashRetry,
} from "./solana";

describe("loadServerSecretKey", () => {
  const prevJson = process.env.SERVER_KEYPAIR_JSON;
  const prevPath = process.env.SERVER_KEYPAIR_PATH;
  const prevMulti = process.env.SERVER_KEYPAIRS_JSON;

  afterEach(() => {
    if (prevJson === undefined) delete process.env.SERVER_KEYPAIR_JSON;
    else process.env.SERVER_KEYPAIR_JSON = prevJson;
    if (prevPath === undefined) delete process.env.SERVER_KEYPAIR_PATH;
    else process.env.SERVER_KEYPAIR_PATH = prevPath;
    if (prevMulti === undefined) delete process.env.SERVER_KEYPAIRS_JSON;
    else process.env.SERVER_KEYPAIRS_JSON = prevMulti;
  });

  it("reads SERVER_KEYPAIR_JSON when set (Workers)", () => {
    process.env.SERVER_KEYPAIR_JSON = "[1,2,3,4]";
    delete process.env.SERVER_KEYPAIR_PATH;
    delete process.env.SERVER_KEYPAIRS_JSON;
    expect(Array.from(loadServerSecretKey())).toEqual([1, 2, 3, 4]);
  });

  it("reads SERVER_KEYPAIRS_JSON as the full signer set", () => {
    process.env.SERVER_KEYPAIRS_JSON = "[[1,2],[3,4,5]]";
    delete process.env.SERVER_KEYPAIR_JSON;
    const keys = loadServerSecretKeys();
    expect(keys).toHaveLength(2);
    expect(Array.from(keys[0]!)).toEqual([1, 2]);
    expect(Array.from(keys[1]!)).toEqual([3, 4, 5]);
  });
});

describe("DEFAULT_SOLANA_RPC_URL", () => {
  it("avoids public Solana endpoints that 403 on Cloudflare Workers", () => {
    expect(DEFAULT_SOLANA_RPC_URL).not.toMatch(/api\.(devnet|testnet|mainnet-beta)\.solana\.com/i);
    expect(DEFAULT_SOLANA_RPC_URL).toMatch(/^https:\/\//);
  });
});

describe("isBlockhashExpiredError", () => {
  it("matches Solana block height / blockhash expiry messages", () => {
    expect(
      isBlockhashExpiredError(
        new Error("Signature abc has expired: block height exceeded."),
      ),
    ).toBe(true);
    expect(isBlockhashExpiredError(new Error("BlockhashNotFound"))).toBe(true);
    expect(isBlockhashExpiredError(new Error("insufficient funds"))).toBe(false);
  });
});

describe("sendWithBlockhashRetry", () => {
  it("rebuilds and retries when the blockhash expires", async () => {
    const umi = {} as Umi;
    let builds = 0;
    const result = await sendWithBlockhashRetry(umi, () => {
      builds += 1;
      return {
        sendAndConfirm: async () => {
          if (builds < 2) {
            throw new Error("Signature x has expired: block height exceeded.");
          }
          return { signature: new Uint8Array([1, 2, 3]) };
        },
      };
    });
    expect(builds).toBe(2);
    expect(Array.from(result.signature)).toEqual([1, 2, 3]);
  });

  it("does not retry non-blockhash errors", async () => {
    const umi = {} as Umi;
    let builds = 0;
    await expect(
      sendWithBlockhashRetry(umi, () => {
        builds += 1;
        return {
          sendAndConfirm: async () => {
            throw new Error("custom program error: 0x1a");
          },
        };
      }),
    ).rejects.toThrow(/0x1a/);
    expect(builds).toBe(1);
  });
});
