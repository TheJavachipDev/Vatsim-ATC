"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const LOGO = {
  light: "/logo-dark.png",
  dark: "/logo-light.png",
} as const;

function resolveLogo(theme: string | undefined): string {
  return theme === "light" ? LOGO.light : LOGO.dark;
}

/** Keeps the document favicon in sync with the active theme toggle. */
export function ThemeAssets() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const href = resolveLogo(resolvedTheme);
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-theme-icon]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.setAttribute("data-theme-icon", "true");
      document.head.appendChild(link);
    }
    link.href = href;
  }, [mounted, resolvedTheme]);

  return null;
}

export function SiteLogo({ size = 36 }: { size?: number }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const src = mounted ? resolveLogo(resolvedTheme) : LOGO.dark;

  return (
    <Image
      src={src}
      alt="vatsim-atc"
      width={size}
      height={size}
      className="rounded-full"
      priority
    />
  );
}
