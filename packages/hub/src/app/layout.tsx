import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartApply Hub",
  description: "Local job-search hub: jobs, résumé library, and applications.",
};

import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Grammarly) add
    // attributes to <html>/<body> before hydration; this only ignores those
    // attribute diffs, not real content mismatches.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">SmartApply Hub</Link>
            <Link href="/">Dashboard</Link>
            <Link href="/library">Library</Link>
            <Link href="/applications">Applications</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
