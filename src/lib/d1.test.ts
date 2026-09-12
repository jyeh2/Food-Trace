import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: async () => body,
  };
}

function d1Success(results: unknown[] = []) {
  return jsonResponse({
    success: true,
    errors: [],
    messages: [],
    result: [{ success: true, results, meta: { changes: results.length } }],
  });
}

describe("d1 HTTP client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.CLOUDFLARE_ACCOUNT_ID = "a".repeat(32);
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "5c1ae019-3071-4e88-9f91-b3da7ce6b2b8";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_D1_DATABASE_ID;
    delete process.env.CLOUDFLARE_DATABASE_ID;
  });

  it("POSTs SQL and params to the D1 query API", async () => {
    fetchMock.mockResolvedValue(d1Success([{ id: "1" }]));
    const { d1All, D1_DATABASE_ID } = await import("./d1");
    const rows = await d1All<{ id: string }>("SELECT * FROM batches WHERE id = ?", ["ABCD"]);
    expect(rows).toEqual([{ id: "1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/d1/database/${D1_DATABASE_ID}/query`,
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      sql: "SELECT * FROM batches WHERE id = ?",
      params: ["ABCD"],
    });
  });

  it("returns the first row or undefined", async () => {
    fetchMock.mockResolvedValueOnce(d1Success([])).mockResolvedValueOnce(d1Success([{ n: 3 }]));
    const { d1First } = await import("./d1");
    expect(await d1First("SELECT 1")).toBeUndefined();
    expect(await d1First<{ n: number }>("SELECT 1")).toEqual({ n: 3 });
  });

  it("falls back to CLOUDFLARE_DATABASE_ID and the known database UUID", async () => {
    delete process.env.CLOUDFLARE_D1_DATABASE_ID;
    process.env.CLOUDFLARE_DATABASE_ID = "11111111-1111-1111-1111-111111111111";
    fetchMock.mockResolvedValue(d1Success());
    const { d1Run } = await import("./d1");
    await d1Run("SELECT 1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("11111111-1111-1111-1111-111111111111");

    delete process.env.CLOUDFLARE_DATABASE_ID;
    vi.resetModules();
    fetchMock.mockResolvedValue(d1Success());
    const { d1Run: d1Run2, D1_DATABASE_ID } = await import("./d1");
    await d1Run2("SELECT 1");
    expect(String(fetchMock.mock.calls[1][0])).toContain(D1_DATABASE_ID);
  });

  it("throws a clear error when account id or API token is missing", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const { d1All } = await import("./d1");
    await expect(d1All("SELECT 1")).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("throws when the D1 API reports failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          errors: [{ code: 7500, message: "no such table: batches" }],
          messages: [],
          result: [],
        },
        false,
        400,
      ),
    );
    const { d1All } = await import("./d1");
    await expect(d1All("SELECT * FROM batches")).rejects.toThrow(/no such table: batches/);
  });
});
