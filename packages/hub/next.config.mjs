/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native / heavy Part-1 deps: keep them out of the server bundle (required at
  // runtime instead of bundled). Pulled in transitively via @smartapply/job-search.
  serverExternalPackages: [
    "better-sqlite3",
    "@smartapply/job-search",
    "playwright",
    "playwright-core",
    "googleapis",
    "exceljs",
  ],
};

export default nextConfig;
