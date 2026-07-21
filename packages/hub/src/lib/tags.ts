/**
 * Controlled tag vocabulary + ontology + a keyword auto-tagger.
 *
 * Tags are the explicit half of matching (the fuzzy half — embeddings — arrives
 * in Phase 4). The ontology lets a bullet tagged `react` also count for
 * `frontend`. Keep this list curated; a noisy vocabulary makes selection noisy.
 */

export type TagCategory = "domain" | "tech" | "soft";

export interface TagDef {
  name: string;
  category: TagCategory;
  /** Lowercase substrings that imply this tag when found in text. */
  match: string[];
}

/** Domain tags (broad areas a flavor emphasizes). */
export const DOMAIN_TAGS: TagDef[] = [
  { name: "frontend", category: "domain", match: ["frontend", "front-end", "front end", "ui ", "user interface", "micro-frontend"] },
  { name: "backend", category: "domain", match: ["backend", "back-end", "back end", "server-side", "apis", "rest api", "microservice"] },
  { name: "fullstack", category: "domain", match: ["full stack", "full-stack", "fullstack"] },
  { name: "cloud", category: "domain", match: ["cloud", "serverless", "infrastructure", "infra ", "devops"] },
  { name: "ai", category: "domain", match: ["ai ", "llm", "genai", "agentic", "bedrock", "rag", "embeddings", "prompt engineering", "ollama"] },
  { name: "distributed-systems", category: "domain", match: ["distributed system", "scaling", "high availability", "petabyte", "throughput"] },
  { name: "testing", category: "domain", match: ["unit test", "e2e", "test coverage", "canary", "tdd", "bdd"] },
  { name: "leadership", category: "soft", match: ["led ", "mentored", "coordinat", "on-call", "oncall", "incident", "leadership"] },
];

/** Tech tags (concrete technologies). */
export const TECH_TAGS: TagDef[] = [
  { name: "react", category: "tech", match: ["react"] },
  { name: "angular", category: "tech", match: ["angular"] },
  { name: "typescript", category: "tech", match: ["typescript"] },
  { name: "javascript", category: "tech", match: ["javascript"] },
  { name: "redux", category: "tech", match: ["redux", "ngrx"] },
  { name: "nextjs", category: "tech", match: ["nextjs", "next.js", "next "] },
  { name: "node", category: "tech", match: ["node", "express"] },
  { name: "python", category: "tech", match: ["python", "fastapi", "flask", "pydantic"] },
  { name: "java", category: "tech", match: ["java", "spring", "junit", "mockito"] },
  { name: "kafka", category: "tech", match: ["kafka"] },
  { name: "kubernetes", category: "tech", match: ["kubernetes", "docker"] },
  { name: "terraform", category: "tech", match: ["terraform", "ansible"] },
  { name: "aws", category: "tech", match: ["aws", "lambda", "cloudfront", "ecs", "route 53", "s3 ", "rds"] },
  { name: "azure", category: "tech", match: ["azure"] },
  { name: "gcp", category: "tech", match: ["gcp"] },
  { name: "oci", category: "tech", match: ["oci", "oracle cloud"] },
  { name: "sql", category: "tech", match: ["sql", "postgres", "rocksdb", "nosql", "elasticsearch", "lucene"] },
  { name: "cicd", category: "tech", match: ["ci/cd", "cicd", "github actions", "jenkins"] },
  { name: "graphql", category: "tech", match: ["graphql"] },
  { name: "d3", category: "tech", match: ["d3", "chart.js", "chats.js"] },
];

export const ALL_TAGS: TagDef[] = [...DOMAIN_TAGS, ...TECH_TAGS];

/** `child` implies `parent`. Traversed 1–2 hops for transitive matching. */
export const TAG_ONTOLOGY: Array<[parent: string, child: string]> = [
  ["frontend", "react"],
  ["frontend", "angular"],
  ["frontend", "redux"],
  ["frontend", "nextjs"],
  ["frontend", "d3"],
  ["backend", "node"],
  ["backend", "python"],
  ["backend", "java"],
  ["backend", "graphql"],
  ["backend", "sql"],
  ["cloud", "aws"],
  ["cloud", "azure"],
  ["cloud", "gcp"],
  ["cloud", "oci"],
  ["cloud", "terraform"],
  ["cloud", "kubernetes"],
  ["cloud", "cicd"],
  ["distributed-systems", "kafka"],
  ["ai", "python"],
];

/** Strip inline <b>…</b> (and any HTML) so matching runs on plain text. */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

/** Return the tag names implied by a piece of text. */
export function autoTag(text: string): string[] {
  const hay = " " + stripHtml(text).toLowerCase() + " ";
  const hits = new Set<string>();
  for (const t of ALL_TAGS) {
    if (t.match.some((m) => hay.includes(m))) hits.add(t.name);
  }
  return [...hits];
}
