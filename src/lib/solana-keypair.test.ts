import { afterEach, describe, expect, it } from "vitest";
import { loadServerSecretKey } from "./solana";

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
