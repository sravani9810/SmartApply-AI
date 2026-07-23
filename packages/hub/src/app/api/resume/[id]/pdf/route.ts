import { NextResponse } from "next/server";
import { getResume } from "../../../../../db/queries";
import { logError } from "../../../../../lib/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/resume/[id]/pdf — render the tailored résumé to PDF by forwarding its
 * ResumeData to the Part 4 resume-builder's /api/cv (which owns the CV template
 * + puppeteer). The builder must be running (default http://localhost:3000);
 * override with RESUME_BUILDER_URL.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const resume = getResume(id);
  if (!resume) return NextResponse.json({ error: "resume not found" }, { status: 404 });

  const base = process.env.RESUME_BUILDER_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/cv?download=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeData: resume.data, fileName: "tailored_resume.pdf" }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `resume-builder returned ${res.status}`, hint: `Is it running at ${base}? (npm run resume:dev)` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="tailored_resume.pdf"',
      },
    });
  } catch (err) {
    logError("resume.pdf", err, { id, base });
    return NextResponse.json(
      { error: (err as Error).message, hint: `Start the resume-builder: npm run resume:dev (expected at ${base})` },
      { status: 502 },
    );
  }
}
