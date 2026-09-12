import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_BUCKET = "hack-cmu-26";
const DEFAULT_ENDPOINT =
  "https://4d38bd1c6da9280b84dae11bb89d5400.r2.cloudflarestorage.com";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function bucket(): string {
  return process.env.R2_BUCKET?.trim() || DEFAULT_BUCKET;
}

function endpoint(): string {
  const explicit = process.env.R2_ENDPOINT?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const account =
    process.env.R2_ACCOUNT_ID?.trim() || process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (account) return `https://${account}.r2.cloudflarestorage.com`;
  return DEFAULT_ENDPOINT;
}

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  cached = new S3Client({
    region: "auto",
    endpoint: endpoint(),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  return cached;
}

/** Object key stored in stages.photo_file (R2 key, not a local path). */
export async function putImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getImage(key: string): Promise<Buffer | null> {
  try {
    const res = await client().send(
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
      }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

/** Public URL if R2_PUBLIC_URL is set; otherwise app proxy route. */
export function photoPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  return `/api/uploads/${key}`;
}
