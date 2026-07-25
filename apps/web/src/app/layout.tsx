import type { Metadata } from "next";
import { BetaBanner } from "@/components/BetaBanner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ThemeAssets } from "@/components/ThemeAssets";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "vatsim-atc.com — ATC coverage forecast",
  description:
    "Predict the likelihood of VATSIM air traffic control coverage at any station, at any time.",
  icons: {
    icon: [
      { url: "/logo-dark.png", media: "(prefers-color-scheme: light)" },
      { url: "/logo-light.png", media: "(prefers-color-scheme: dark)" },
    ],
    shortcut: "/logo-light.png",
    apple: "/logo-light.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          <ThemeAssets />
          <BetaBanner />
          <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
            <Header />
            <main className="flex-1 py-6">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
