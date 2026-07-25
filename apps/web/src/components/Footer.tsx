export function Footer() {
  return (
    <footer className="border-t border-zinc-200/80 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-500">
      <p>
        Designed by Javachip - James Sells | Not affiliated with VATSIM. Data from the VATSIM public datafeed.{" "}
        <a
          href="https://github.com/TheJavachipDev/Vatsim-ATC"
          className="text-zinc-500 underline decoration-dotted underline-offset-2 transition hover:text-accent dark:text-zinc-400"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </p>
    </footer>
  );
}
