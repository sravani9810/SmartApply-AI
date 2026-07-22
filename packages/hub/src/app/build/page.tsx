import Link from "next/link";
import { getFlavors } from "../../db/queries";
import { Composer } from "../../components/Composer";

export const dynamic = "force-dynamic";

export default async function BuildPage() {
  const flavors = getFlavors().map((f) => ({ id: f.id, name: f.name }));

  return (
    <main className="wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ marginBottom: 0 }}>Résumé composer</h1>
        <Link href="/resumes" className="backlink">résumé library →</Link>
      </div>
      <p className="sub">
        Paste a job description, tell Claude what to change, and get a tailored résumé.
        Bullets stay grounded in your library; skills, summary, and role framing follow your instructions.
      </p>
      <Composer flavors={flavors} />
    </main>
  );
}
