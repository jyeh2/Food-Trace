/** Client-safe Solana explorer link helper (no Node APIs). */
export function explorerUrl(kind: "address" | "tx", id: string) {
  const cluster =
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
    process.env.SOLANA_CLUSTER ??
    "devnet";
  return `https://explorer.solana.com/${kind}/${id}?cluster=${cluster}`;
}
