/** Cloudflare D1 identifiers from wrangler.toml. */
export const D1_BINDING = "DB";
export const D1_DATABASE_NAME = "cmuhacks-food-trace";
export const D1_DATABASE_ID = "5c1ae019-3071-4e88-9f91-b3da7ce6b2b8";

export type SqlValue = string | number | null;

type D1Error = { code?: number; message?: string };
type D1QueryResponse = {
  success?: boolean;
  errors?: D1Error[];
  messages?: D1Error[];
  result?: { success?: boolean; results?: unknown[]; meta?: { changes?: number } }[];
};

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `Missing ${name}. Set Cloudflare D1 env vars in .env.local: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID.`,
    );
  }
  return v;
}

export function d1Config() {
  return {
    accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requiredEnv("CLOUDFLARE_API_TOKEN"),
    databaseId:
      process.env.CLOUDFLARE_D1_DATABASE_ID?.trim() ||
      process.env.CLOUDFLARE_DATABASE_ID?.trim() ||
      D1_DATABASE_ID,
  };
}

async function d1Request(sql: string, params: SqlValue[] = []): Promise<D1QueryResponse> {
  const { accountId, apiToken, databaseId } = d1Config();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as D1QueryResponse;
  if (!res.ok || body.success === false) {
    const msg =
      body.errors?.[0]?.message ??
      body.messages?.[0]?.message ??
      `${res.status} ${res.statusText}`.trim();
    throw new Error(`D1 query failed: ${msg}`);
  }
  return body;
}

export async function d1All<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  const body = await d1Request(sql, params);
  const last = body.result?.at(-1);
  return (last?.results ?? []) as T[];
}

export async function d1First<T>(sql: string, params: SqlValue[] = []): Promise<T | undefined> {
  const rows = await d1All<T>(sql, params);
  return rows[0];
}

export async function d1Run(sql: string, params: SqlValue[] = []): Promise<void> {
  await d1Request(sql, params);
}
