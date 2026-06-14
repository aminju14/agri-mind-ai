/**
 * Generation client seam (Phase 2 Chat Engine).
 *
 * Streams the specialist's answer as raw text deltas. The block parser
 * (src/server/llm/block-parser.ts) turns the `H:/P:/U:` notation into the frozen
 * Block[] and the orchestrator emits SSE block events from it.
 *
 * Like the Task-3 classifier, this is an injectable interface so the whole pipeline +
 * UI are testable/demoable WITHOUT a key: when ANTHROPIC_API_KEY is absent we use a
 * deterministic FakeGenerator that streams a canned frozen-shape answer.
 */

import type { Lang } from "@/lib/types";
import type { AgentKey } from "@/ai/types";

export interface GenerateRequest {
  /** Specialist system prompt to inject (from the agent registry). */
  system: string;
  /** The user's message. */
  user: string;
  lang: Lang;
  agentKey: AgentKey;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

/**
 * Streams raw answer text. The async iterator yields text chunks; the final return value
 * (via the `usage` callback) reports token usage. We use a callback for usage so the
 * iterator stays a clean `AsyncIterable<string>`.
 */
export interface GenerationClient {
  /** Stream text deltas for one answer. MUST honor `signal` (stop billing on abort). */
  stream(req: GenerateRequest, onUsage?: (u: GenerationUsage) => void): AsyncIterable<string>;
  /** Identifier for logging/persistence (modelId). */
  readonly modelId: string;
}

// ---------------------------------------------------------------------------
// Real Anthropic streaming generator
// ---------------------------------------------------------------------------

export function createAnthropicGenerator(opts?: { apiKey?: string; model?: string }): GenerationClient {
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

  return {
    modelId: model,
    async *stream(req, onUsage) {
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });

      const s = client.messages.stream(
        {
          model,
          max_tokens: req.maxTokens ?? 1100, // hard output cap (MASTER §8)
          temperature: req.temperature ?? 0.4,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        { signal: req.signal },
      );

      for await (const event of s) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
      const final = await s.finalMessage();
      onUsage?.({
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        modelId: model,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Fake generator (no key) — streams a canned, frozen-shape answer per agent.
// ---------------------------------------------------------------------------

/** Per-agent canned answers in the `H:/P:/U:` notation. Bilingual. */
const FAKE_ANSWERS: Record<AgentKey, Record<Lang, string>> = {
  agronomist: {
    en: `H: Start with soil, not seeds
P: A small plot is forgiving if you get the foundation right. Before buying seed, run a quick soil texture and pH check.
P: For your first season, pick two or three fast-cycle crops so you learn the full grow-to-harvest loop quickly.
U: Test soil pH and drainage before planting
U: Begin with leafy greens or legumes
U: Lay out beds around sunlight, not convenience
U: Keep a simple log of what you plant and when
I: Spend week one on soil, not on seeds — most first-season losses trace back to skipping the soil test.`,
    id: `H: Mulai dari tanah, bukan benih
P: Lahan kecil mudah dikelola jika fondasinya benar. Sebelum membeli benih, cek tekstur dan pH tanah.
P: Untuk musim pertama, pilih dua atau tiga tanaman bersiklus cepat agar Anda cepat memahami siklus tanam hingga panen.
U: Uji pH dan drainase tanah sebelum menanam
U: Mulai dari sayuran daun atau kacang-kacangan
U: Tata bedengan mengikuti arah matahari
U: Catat apa yang ditanam dan kapan
I: Habiskan minggu pertama untuk tanah, bukan benih — kerugian musim pertama umumnya karena melewatkan uji tanah.`,
  },
  plantdoctor: {
    en: `H: Likely a fungal leaf disease
P: Yellowing on older leaves with spots is a classic fungal signature that thrives in warm, humid conditions. This is a likely diagnosis from your description — confirm with a photo or local clinic.
P: Move quickly to protect the upper canopy. Sanitation and airflow matter more than chemicals at this stage.
U: Remove and destroy affected lower leaves
U: Water at the base, never overhead
U: Improve airflow between plants
U: Read the product label before any fungicide
I: Target-like rings with a yellow halo mean disease, not a nutrient gap — nutrient yellowing is uniform and ringless.`,
    id: `H: Kemungkinan penyakit jamur pada daun
P: Menguning pada daun tua disertai bercak adalah ciri khas penyakit jamur yang berkembang pada kondisi hangat dan lembap. Ini diagnosis sementara — konfirmasi dengan foto atau klinik setempat.
P: Bertindak cepat untuk melindungi tajuk atas. Sanitasi dan sirkulasi udara lebih penting daripada bahan kimia.
U: Buang dan musnahkan daun bawah yang terinfeksi
U: Siram di pangkal, jangan dari atas
U: Perbaiki sirkulasi udara antar tanaman
U: Baca label produk sebelum memakai fungisida
I: Cincin seperti target dengan halo kuning berarti penyakit, bukan kekurangan hara — menguning karena hara bersifat merata tanpa cincin.`,
  },
  farmplanner: {
    en: `H: A staggered plan spreads your risk
P: Plant in two-week waves so your harvest and your risk are spread out instead of riding on a single window.
P: Raised beds and clear drainage are non-negotiable; standing water kills most plantings.
U: Weeks 1–2: water-tolerant starters
U: Weeks 3–4: main crops on raised beds
U: Side-dress nutrients mid-season
U: Keep a sheltered nursery for transplants
I: Plant in waves — a single planting is a single point of failure if one storm lands at the wrong moment.`,
    id: `H: Rencana bertahap menyebarkan risiko
P: Tanam dalam gelombang dua mingguan agar panen dan risiko tersebar, bukan bertumpu pada satu jendela waktu.
P: Bedengan tinggi dan drainase yang jelas wajib; genangan air mematikan sebagian besar tanaman.
U: Minggu 1–2: tanaman pembuka tahan air
U: Minggu 3–4: tanaman utama di bedengan tinggi
U: Tambahkan hara di pertengahan musim
U: Sediakan persemaian terlindung untuk bibit
I: Tanam dalam gelombang — satu kali tanam berarti satu titik gagal bila badai datang di saat yang salah.`,
  },
  research: {
    en: `H: Here is the market picture
P: Prices are seasonally volatile but trending on tight supply and steady demand. Treat this as general guidance — verify current figures before you commit.
P: Margins favor growers who time harvest to the off-peak window and hedge with storage or drying.
U: Demand: stable from processing buyers
U: Risk: large price swings within a season
U: Edge: storage/drying smooths volatility
U: Watch: fertilizer and labor costs
I: Do not chase peak prices — growers who win here win on timing and storage, not on simply planting more.`,
    id: `H: Berikut gambaran pasarnya
P: Harga fluktuatif secara musiman namun cenderung naik karena pasokan ketat dan permintaan stabil. Anggap ini panduan umum — verifikasi angka terkini sebelum memutuskan.
P: Margin berpihak pada petani yang mengatur panen ke jendela sepi dan melindungi nilai dengan penyimpanan atau pengeringan.
U: Permintaan: stabil dari pembeli pengolahan
U: Risiko: gejolak harga besar dalam semusim
U: Keunggulan: penyimpanan/pengeringan meredam volatilitas
U: Cermati: biaya pupuk dan tenaga kerja
I: Jangan kejar harga puncak — petani yang menang menang lewat ketepatan waktu dan penyimpanan, bukan sekadar menanam lebih banyak.`,
  },
};

/**
 * Deterministic fake generator. Streams the canned answer in small chunks so the
 * client reveal animates exactly like a real stream. No network, no key.
 */
export function createFakeGenerator(opts?: { chunkSize?: number; delayMs?: number }): GenerationClient {
  const chunkSize = opts?.chunkSize ?? 6;
  const delayMs = opts?.delayMs ?? 12;
  return {
    modelId: "fake-generator",
    async *stream(req, onUsage) {
      const text = FAKE_ANSWERS[req.agentKey][req.lang];
      for (let i = 0; i < text.length; i += chunkSize) {
        if (req.signal?.aborted) return;
        yield text.slice(i, i + chunkSize);
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
      onUsage?.({ inputTokens: 0, outputTokens: text.length, modelId: "fake-generator" });
    },
  };
}

/** Pick the real generator if a key is present, else the fake (no-key dev/demo). */
export function createDefaultGenerator(): GenerationClient {
  return process.env.ANTHROPIC_API_KEY ? createAnthropicGenerator() : createFakeGenerator();
}
