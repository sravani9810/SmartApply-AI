// One-time LinkedIn login. Opens the persistent Chrome profile so you can sign
// in; the session is saved to the profile dir and reused by the LinkedIn
// connector.
//
// Usage (from repo root):  npm run login:linkedin
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });
loadEnv();

const profileDir =
  process.env.LINKEDIN_PROFILE_DIR ??
  join(homedir(), ".config", "smartapply", "linkedin-profile");

console.log(`Opening Chrome with profile: ${profileDir}`);
const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: "chrome",
  viewport: { width: 1280, height: 900 },
  chromiumSandbox: true,
  args: ["--disable-blink-features=AutomationControlled"],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://www.linkedin.com/login");

console.log(
  "\nA Chrome window opened. Log into LinkedIn there (complete any verification).",
);
console.log("When you can see you are signed in, come back here and press Enter.\n");

await new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Press Enter once logged in… ", () => {
    rl.close();
    res();
  });
});

await context.close();
console.log(`\nSession saved to ${profileDir}. You can now run: npm run search`);
