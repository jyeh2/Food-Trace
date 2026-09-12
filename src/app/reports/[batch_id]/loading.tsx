export default function Loading() {
  return (
    <div className="mx-auto max-w-[816px] animate-pulse space-y-4 bg-white p-10 shadow-sm">
      <div className="h-4 w-40 bg-neutral-200" />
      <div className="h-10 w-3/4 bg-neutral-200" />
      <div className="h-4 w-full bg-neutral-100" />
      <div className="h-4 w-5/6 bg-neutral-100" />
      <p className="pt-6 text-sm text-neutral-500">Generating product report…</p>
    </div>
  );
}
