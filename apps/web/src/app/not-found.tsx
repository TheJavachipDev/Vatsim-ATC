import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-24 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Unknown station</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        That doesn&apos;t look like a valid station code. Try a VATSIM callsign prefix such as{" "}
        <span className="font-mono text-zinc-500">EGKK</span> or <span className="font-mono text-zinc-500">KTPA</span>.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:border-accent hover:text-accent dark:border-zinc-700 dark:text-zinc-200"
      >
        Back to search
      </Link>
    </div>
  );
}
