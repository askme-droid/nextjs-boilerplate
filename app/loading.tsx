// Shown while any top-level route (mainly "/", which queries listings) is
// still fetching. Kept generic since /admin and /login also inherit it.
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-16">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    </div>
  );
}
