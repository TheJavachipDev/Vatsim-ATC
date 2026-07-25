/** @format */

import Link from "next/link";
import { DiscordButton } from "@/components/DiscordButton";
import { SiteLogo } from "@/components/ThemeAssets";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200/80 py-4 dark:border-zinc-800/50">
      <Link href="/" className="group flex items-center gap-3">
        <SiteLogo />
        <span className="flex flex-col">
          <span className="text-base font-semibold tracking-tight text-zinc-900 transition group-hover:text-zinc-950 dark:text-zinc-100 dark:group-hover:text-white">
            vatsim-atc
          </span>
          <span className="text-[11px] tracking-wide text-zinc-500">
            coverage forecast
          </span>
        </span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link href="https://vatsim-radar.com" className="nav-link">
          Map
        </Link>
        <Link href="/route" className="nav-link">
          Route
        </Link>
        <Link href="/api-docs" className="nav-link">
          API
        </Link>
        <ThemeToggle />
        <DiscordButton />
      </nav>
    </header>
  );
}
