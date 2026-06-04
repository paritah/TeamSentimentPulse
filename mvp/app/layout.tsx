import type { Metadata } from "next";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Manrope({
  variable: "--font-sans-ui",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Team Sentiment Pulse",
  description: "Pulse survey only MVP for team sentiment tracking",
};

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/surveys", label: "Surveys" },
  { href: "/alerts", label: "Alerts" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/retention", label: "Retention" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-app-ink text-slate-100">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-app-ink/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">PulseCheck</p>
              <h1 className="font-display text-xl font-semibold text-white">Team Sentiment Pulse</h1>
            </div>
            <nav className="flex flex-wrap items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
