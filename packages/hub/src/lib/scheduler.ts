import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const run = promisify(execFile);

const LABEL = "com.smartapply.jobsearch";
const REL_SCRIPT = "packages/job-search/scripts/schedule.sh";

export interface SchedulerStatus {
  supported: boolean;      // macOS + script found
  on: boolean;
  label: string;
  /** Raw `launchctl list` line for the agent (PID / last exit status), if loaded. */
  detail?: string;
  logPath?: string;
  error?: string;
}

/** Walk up from the hub's cwd to find the repo root that holds schedule.sh. */
function findScheduleScript(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, REL_SCRIPT);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function invoke(cmd: "on" | "off" | "now" | "status"): Promise<string> {
  const script = findScheduleScript();
  if (!script) throw new Error(`Could not locate ${REL_SCRIPT} from ${process.cwd()}`);
  const { stdout, stderr } = await run("bash", [script, cmd], { timeout: 20_000 });
  return `${stdout}${stderr}`.trim();
}

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  const logPath = join(process.env.HOME ?? "", "Library", "Logs", "smartapply", "hourly.log");
  if (process.platform !== "darwin") {
    return { supported: false, on: false, label: LABEL, error: "Scheduling is macOS-only (launchd)." };
  }
  try {
    const out = await invoke("status");
    const on = /Scheduler:\s*ON/i.test(out);
    const detail = out.split("\n").find((l) => l.includes(LABEL) && /\d/.test(l))?.trim();
    return { supported: true, on, label: LABEL, detail, logPath };
  } catch (err) {
    return { supported: true, on: false, label: LABEL, logPath, error: (err as Error).message };
  }
}

export async function controlScheduler(
  cmd: "on" | "off" | "now",
): Promise<{ ok: boolean; output?: string; error?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Scheduling is macOS-only (launchd)." };
  }
  try {
    const output = await invoke(cmd);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
