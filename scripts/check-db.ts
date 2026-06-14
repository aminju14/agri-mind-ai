import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  try {
    const result = await p.$queryRawUnsafe("SELECT 1 AS ok");
    console.log("✅ DB connected:", JSON.stringify(result));

    // Check tables
    const tables = await p.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `) as Array<{ table_name: string }>;
    console.log("📋 Tables:", tables.map((t) => t.table_name).join(", "));

    // Check pgvector extension
    const ext = await p.$queryRawUnsafe(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'vector'
    `) as Array<{ extname: string; extversion: string }>;
    if (ext.length > 0) {
      console.log("🧩 pgvector:", ext[0].extversion);
    } else {
      console.log("⚠️  pgvector extension NOT installed");
    }

    // Quick row counts
    const counts = await p.$queryRawUnsafe(`
      SELECT 
        (SELECT COUNT(*) FROM chunks)::int AS chunks,
        (SELECT COUNT(*) FROM citations)::int AS citations,
        (SELECT COUNT(*) FROM conversations)::int AS conversations,
        (SELECT COUNT(*) FROM messages)::int AS messages,
        (SELECT COUNT(*) FROM documents)::int AS documents
    `) as Array<{ chunks: number; citations: number; conversations: number; messages: number; documents: number }>;
    if (counts.length > 0) {
      const c = counts[0];
      console.log(`📊 Rows: chunks=${c.chunks}, citations=${c.citations}, conversations=${c.conversations}, messages=${c.messages}, documents=${c.documents}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("❌ DB error:", msg);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
}

main();
