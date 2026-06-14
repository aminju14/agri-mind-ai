/**
 * TASK 6 — Knowledge-base ingestion CLI.
 *
 * Walks the knowledge/ tree, parses each markdown file's frontmatter (title/source/
 * category/lang), and ingests it through the RAG pipeline (chunk → embed → index).
 * Idempotent: unchanged files are skipped by content checksum.
 *
 * Requires OPENAI_API_KEY (embeddings). Run:  npx tsx scripts/ingest-knowledge.ts
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { ingestRawDocument, type IngestInput } from "@/server/rag";
import { prisma } from "@/server/persistence/prisma";
import type { Lang } from "@/lib/types";

const ROOT = join(process.cwd(), "knowledge");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Parse `---` YAML-ish frontmatter (title/source/category/lang) + body. */
function parse(file: string): IngestInput | null {
  const raw = readFileSync(file, "utf8");
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) {
    console.warn(`[ingest] no frontmatter, skipping: ${file}`);
    return null;
  }
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) meta[kv[1].trim()] = kv[2].trim();
  }
  const lang = (meta.lang === "id" ? "id" : "en") as Lang;
  if (!meta.title || !meta.source || !meta.category) {
    console.warn(`[ingest] missing title/source/category, skipping: ${file}`);
    return null;
  }
  return {
    title: meta.title,
    source: meta.source,
    category: meta.category,
    lang,
    body: m[2].trim(),
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required for ingestion (embeddings). Set it in .env.");
    process.exit(1);
  }
  const files = walk(ROOT);
  console.log(`[ingest] found ${files.length} markdown files under knowledge/`);
  let ingested = 0;
  let skipped = 0;
  let chunks = 0;
  for (const file of files) {
    const input = parse(file);
    if (!input) continue;
    try {
      const res = await ingestRawDocument(input);
      if (res.skipped) {
        skipped++;
        console.log(`  skip  ${input.category}/${input.lang}  ${input.title}`);
      } else {
        ingested++;
        chunks += res.chunkCount;
        console.log(`  OK    ${input.category}/${input.lang}  ${input.title}  (${res.chunkCount} chunks)`);
      }
    } catch (e) {
      console.error(`  FAIL  ${file}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\n[ingest] done — ingested ${ingested}, skipped ${skipped}, ${chunks} new chunks.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
