import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartApply Hub",
  description: "Local job-search hub: jobs, résumé library, and applications.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
