/**
 * Quick Tavily API key validation — sends a minimal search to confirm the key works.
 */
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

if (!TAVILY_API_KEY) {
  console.error("❌ TAVILY_API_KEY not set in .env");
  process.exit(1);
}

console.log(`🔑 Key detected: ${TAVILY_API_KEY.slice(0, 12)}...${TAVILY_API_KEY.slice(-4)} (${TAVILY_API_KEY.length} chars)`);

async function testTavily() {
  const t0 = Date.now();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: "Harga cabai terkini di Indonesia",
      search_depth: "advanced",
      topic: "news",
      max_results: 3,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  const ms = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Tavily HTTP ${res.status} (${ms}ms): ${body}`);
    process.exit(1);
  }

  const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
  const results = data.results ?? [];
  console.log(`✅ Tavily API OK — ${results.length} results in ${ms}ms`);
  for (const r of results) {
    console.log(`   📰 [${(r.score ?? 0).toFixed(2)}] ${r.title}`);
    console.log(`      ${r.url}`);
  }
}

testTavily().catch((e) => {
  console.error("❌ Network error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
