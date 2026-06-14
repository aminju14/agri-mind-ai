import type {
  Agent,
  AgentKey,
  HistoryGroup,
  Lang,
  PanelData,
  PromptDef,
  ResponsePayload,
  Strings,
} from "./types";

export const AGENTS: Record<AgentKey, Agent> = {
  agronomist: { key: "agronomist", en: "Agronomist Agent", id: "Agen Agronomi", emoji: "🌱", hue: 142, color: "#22C55E" },
  plantdoctor: { key: "plantdoctor", en: "Plant Doctor Agent", id: "Agen Dokter Tanaman", emoji: "🩺", hue: 199, color: "#38BDF8" },
  farmplanner: { key: "farmplanner", en: "Farm Planner Agent", id: "Agen Perencana Lahan", emoji: "🗓️", hue: 262, color: "#A78BFA" },
  research: { key: "research", en: "Research Agent", id: "Agen Riset", emoji: "📊", hue: 38, color: "#FBBF24" },
};

export const AGENT_ORDER: AgentKey[] = ["agronomist", "plantdoctor", "farmplanner", "research"];

export const PROMPTS: PromptDef[] = [
  {
    key: "learn",
    agent: "agronomist",
    icon: "book",
    en: { title: "Learn Farming", desc: "Start a small plot the right way", q: "How do I start farming on a small plot?" },
    id: { title: "Belajar Bertani", desc: "Mulai lahan kecil dengan benar", q: "Bagaimana cara memulai bertani di lahan kecil?" },
  },
  {
    key: "diagnose",
    agent: "plantdoctor",
    icon: "leaf",
    en: { title: "Diagnose Plant Problems", desc: "Identify disease from symptoms", q: "My tomato leaves are turning yellow with brown spots — what is wrong?" },
    id: { title: "Diagnosa Masalah Tanaman", desc: "Kenali penyakit dari gejala", q: "Daun tomat saya menguning dengan bercak coklat — apa masalahnya?" },
  },
  {
    key: "planning",
    agent: "farmplanner",
    icon: "calendar",
    en: { title: "Farm Planning", desc: "Build a season planting calendar", q: "Build me a planting calendar for the rainy season." },
    id: { title: "Perencanaan Lahan", desc: "Susun kalender tanam semusim", q: "Buatkan kalender tanam untuk musim hujan." },
  },
  {
    key: "crops",
    agent: "agronomist",
    icon: "sprout",
    en: { title: "Crop Recommendations", desc: "Match crops to your soil & sun", q: "What should I grow in sandy soil with full sun?" },
    id: { title: "Rekomendasi Tanaman", desc: "Cocokkan tanaman dengan tanah & matahari", q: "Apa yang sebaiknya saya tanam di tanah berpasir dengan sinar matahari penuh?" },
  },
  {
    key: "market",
    agent: "research",
    icon: "chart",
    en: { title: "Market Research", desc: "Price outlook before you plant", q: "Is it worth growing chili this season?" },
    id: { title: "Riset Pasar", desc: "Prospek harga sebelum menanam", q: "Apakah menanam cabai musim ini menguntungkan?" },
  },
];

export const RESPONSES: Record<string, Record<Lang, ResponsePayload>> = {
  learn: {
    en: {
      blocks: [
        { type: "h", text: "Start with soil, not seeds" },
        { type: "p", text: "A small plot is forgiving if you get the foundation right. Before buying a single seed, run a quick soil texture and pH check — it tells you what will actually thrive instead of what you hope will." },
        { type: "p", text: "For your first season, pick two or three high-value, fast-cycle crops so you experience the full grow-to-harvest loop quickly and learn from it." },
        { type: "ul", items: ["Test soil pH and drainage before planting", "Begin with leafy greens or legumes — forgiving and fast", "Lay out beds around sunlight, not convenience", "Keep a simple log of what you plant and when"] },
      ],
      citations: [
        { title: "FAO Smallholder Soil Guide", category: "Agronomy", source: "fao.org" },
        { title: "Crop Rotation Basics", category: "Knowledge Base", source: "agrimind.ai" },
        { title: "Beginner Bed Planning", category: "Guide", source: "extension.edu" },
      ],
      insight: "Most first-season losses come from skipping the soil test, not from inexperience. Spend week one on soil, not on seeds.",
    },
    id: {
      blocks: [
        { type: "h", text: "Mulai dari tanah, bukan benih" },
        { type: "p", text: "Lahan kecil mudah dikelola jika fondasinya benar. Sebelum membeli benih, lakukan cek tekstur dan pH tanah — ini menentukan tanaman apa yang benar-benar cocok, bukan sekadar harapan." },
        { type: "p", text: "Untuk musim pertama, pilih dua atau tiga tanaman bernilai tinggi dan bersiklus cepat agar Anda cepat mengalami siklus tanam hingga panen secara penuh." },
        { type: "ul", items: ["Uji pH dan drainase tanah sebelum menanam", "Mulai dari sayuran daun atau kacang-kacangan — cepat & toleran", "Tata bedengan mengikuti arah matahari, bukan kemudahan", "Catat sederhana apa yang ditanam dan kapan"] },
      ],
      citations: [
        { title: "Panduan Tanah Petani Kecil FAO", category: "Agronomi", source: "fao.org" },
        { title: "Dasar Rotasi Tanaman", category: "Basis Pengetahuan", source: "agrimind.ai" },
        { title: "Perencanaan Bedengan Pemula", category: "Panduan", source: "extension.edu" },
      ],
      insight: "Kerugian musim pertama umumnya karena melewatkan uji tanah, bukan karena kurang pengalaman. Habiskan minggu pertama untuk tanah, bukan benih.",
    },
  },
  diagnose: {
    en: {
      blocks: [
        { type: "h", text: "Likely early blight (Alternaria solani)" },
        { type: "p", text: "Yellowing that begins on the lower, older leaves alongside brown spots with concentric rings is the classic signature of early blight — a fungal disease that thrives in warm, humid conditions." },
        { type: "p", text: "Move quickly to protect the upper canopy and developing fruit. Sanitation and airflow matter more than fungicide at this stage." },
        { type: "ul", items: ["Remove and destroy affected lower leaves immediately", "Water at the base — never overhead", "Apply a copper-based or chlorothalonil fungicide if it spreads", "Mulch to stop soil splashing spores onto leaves"] },
      ],
      citations: [
        { title: "Tomato Early Blight — IPM", category: "Plant Pathology", source: "cornell.edu" },
        { title: "Alternaria solani Field ID", category: "Diagnosis", source: "agrimind.ai" },
        { title: "Organic Fungicide Options", category: "Treatment", source: "extension.edu" },
      ],
      insight: "Target-like brown rings with a yellow halo mean blight — not a nutrient deficiency. Nutrient yellowing is uniform and lacks the rings.",
    },
    id: {
      blocks: [
        { type: "h", text: "Kemungkinan bercak kering (Alternaria solani)" },
        { type: "p", text: "Menguning yang dimulai dari daun bawah yang lebih tua disertai bercak coklat bercincin konsentris adalah ciri khas penyakit bercak kering — jamur yang berkembang pada kondisi hangat dan lembap." },
        { type: "p", text: "Bertindak cepat untuk melindungi tajuk atas dan buah yang sedang berkembang. Sanitasi dan sirkulasi udara lebih penting daripada fungisida di tahap ini." },
        { type: "ul", items: ["Segera buang dan musnahkan daun bawah yang terinfeksi", "Siram di pangkal — jangan dari atas", "Gunakan fungisida berbahan tembaga atau klorotalonil bila menyebar", "Beri mulsa agar percikan tanah tak membawa spora ke daun"] },
      ],
      citations: [
        { title: "Bercak Kering Tomat — IPM", category: "Patologi Tanaman", source: "cornell.edu" },
        { title: "Identifikasi Alternaria solani", category: "Diagnosis", source: "agrimind.ai" },
        { title: "Opsi Fungisida Organik", category: "Penanganan", source: "extension.edu" },
      ],
      insight: "Cincin coklat seperti target dengan halo kuning berarti penyakit jamur — bukan kekurangan hara. Menguning karena hara bersifat merata dan tanpa cincin.",
    },
  },
  planning: {
    en: {
      blocks: [
        { type: "h", text: "A staggered rainy-season plan" },
        { type: "p", text: "Use the wet months for water-hungry crops, and plant in two-week waves so your harvest — and your risk — is spread out instead of riding on a single window." },
        { type: "p", text: "Raised beds and clear drainage channels are non-negotiable in heavy rain; standing water is what actually kills most rainy-season plantings." },
        { type: "ul", items: ["Weeks 1–2: rice, kangkong, taro (water-tolerant)", "Weeks 3–4: corn and long beans on raised beds", "Mid-season: side-dress nitrogen after heavy rain", "Keep a sheltered nursery for transplants"] },
      ],
      citations: [
        { title: "Wet-Season Cropping Calendar", category: "Planning", source: "agrimind.ai" },
        { title: "Raised Bed Drainage", category: "Field Guide", source: "extension.edu" },
        { title: "Staggered Planting Method", category: "Knowledge Base", source: "fao.org" },
      ],
      insight: "Plant in waves. A single planting is a single point of failure if one storm lands at the wrong moment.",
    },
    id: {
      blocks: [
        { type: "h", text: "Rencana musim hujan bertahap" },
        { type: "p", text: "Manfaatkan bulan basah untuk tanaman yang butuh banyak air, dan tanam dalam gelombang dua mingguan agar panen — dan risikonya — tersebar, bukan bertumpu pada satu jendela waktu." },
        { type: "p", text: "Bedengan tinggi dan saluran drainase yang jelas wajib saat hujan deras; genangan air adalah penyebab utama gagalnya tanaman musim hujan." },
        { type: "ul", items: ["Minggu 1–2: padi, kangkung, talas (tahan air)", "Minggu 3–4: jagung dan kacang panjang di bedengan tinggi", "Pertengahan musim: tambahkan nitrogen setelah hujan deras", "Sediakan persemaian terlindung untuk bibit"] },
      ],
      citations: [
        { title: "Kalender Tanam Musim Hujan", category: "Perencanaan", source: "agrimind.ai" },
        { title: "Drainase Bedengan Tinggi", category: "Panduan Lapangan", source: "extension.edu" },
        { title: "Metode Tanam Bertahap", category: "Basis Pengetahuan", source: "fao.org" },
      ],
      insight: "Tanam dalam gelombang. Satu kali tanam berarti satu titik gagal bila badai datang di saat yang salah.",
    },
  },
  crops: {
    en: {
      blocks: [
        { type: "h", text: "Best crops for sandy, sunny plots" },
        { type: "p", text: "Sandy soil drains fast and warms early — perfect for root crops and heat-lovers, but tough on thirsty leafy greens that wilt by midday." },
        { type: "p", text: "Work in compost and mulch heavily to hold moisture so lighter feeders are not stressed during peak sun." },
        { type: "ul", items: ["Strong fits: carrots, radish, sweet potato, peanut", "Heat-lovers: watermelon, okra, chili", "Amend with compost to hold moisture", "Mulch deeply to cut evaporation"] },
      ],
      citations: [
        { title: "Crops for Sandy Soils", category: "Agronomy", source: "agrimind.ai" },
        { title: "Improving Sandy Soil", category: "Soil Science", source: "extension.edu" },
        { title: "Drought-Smart Selection", category: "Guide", source: "fao.org" },
      ],
      insight: "Sandy soil is not poor soil — it is fast soil. Match it with crops that like quick drainage instead of fighting its nature.",
    },
    id: {
      blocks: [
        { type: "h", text: "Tanaman terbaik untuk lahan berpasir & terik" },
        { type: "p", text: "Tanah berpasir cepat kering dan cepat hangat — ideal untuk umbi dan tanaman penyuka panas, namun berat bagi sayuran daun yang layu di tengah hari." },
        { type: "p", text: "Campurkan kompos dan beri mulsa tebal untuk menahan kelembapan agar tanaman yang butuh air tak tertekan saat matahari terik." },
        { type: "ul", items: ["Sangat cocok: wortel, lobak, ubi jalar, kacang tanah", "Penyuka panas: semangka, okra, cabai", "Perbaiki dengan kompos untuk menahan air", "Beri mulsa tebal untuk menekan penguapan"] },
      ],
      citations: [
        { title: "Tanaman untuk Tanah Berpasir", category: "Agronomi", source: "agrimind.ai" },
        { title: "Memperbaiki Tanah Berpasir", category: "Ilmu Tanah", source: "extension.edu" },
        { title: "Pemilihan Tahan Kering", category: "Panduan", source: "fao.org" },
      ],
      insight: "Tanah berpasir bukan tanah buruk — itu tanah yang cepat. Pasangkan dengan tanaman yang menyukai drainase cepat alih-alih melawannya.",
    },
  },
  market: {
    en: {
      blocks: [
        { type: "h", text: "Chili market outlook" },
        { type: "p", text: "Chili prices are seasonally volatile but trending up on tight supply and steady demand from sauce and processing buyers." },
        { type: "p", text: "Margins favor growers who can time harvest to the off-peak supply window and sell dried as a hedge against price swings." },
        { type: "ul", items: ["Demand: stable from sauce & processing buyers", "Risk: 30–50% price swings within a single season", "Edge: drying capacity smooths volatility", "Watch: fertilizer and labor input costs"] },
      ],
      citations: [
        { title: "Regional Chili Price Index", category: "Market Data", source: "agrimind.ai" },
        { title: "Horticulture Demand Report 2026", category: "Research", source: "usda.gov" },
        { title: "Post-Harvest Drying ROI", category: "Analysis", source: "extension.edu" },
      ],
      insight: "Do not chase peak prices. Growers who win on chili win on timing and drying — not on simply planting more.",
    },
    id: {
      blocks: [
        { type: "h", text: "Prospek pasar cabai" },
        { type: "p", text: "Harga cabai fluktuatif secara musiman namun cenderung naik karena pasokan ketat dan permintaan stabil dari pembeli saus dan pengolahan." },
        { type: "p", text: "Margin berpihak pada petani yang bisa mengatur panen ke jendela pasokan sepi dan menjual cabai kering sebagai lindung nilai terhadap gejolak harga." },
        { type: "ul", items: ["Permintaan: stabil dari pembeli saus & pengolahan", "Risiko: gejolak harga 30–50% dalam satu musim", "Keunggulan: kapasitas pengeringan meredam volatilitas", "Cermati: biaya pupuk dan tenaga kerja"] },
      ],
      citations: [
        { title: "Indeks Harga Cabai Regional", category: "Data Pasar", source: "agrimind.ai" },
        { title: "Laporan Permintaan Hortikultura 2026", category: "Riset", source: "usda.gov" },
        { title: "ROI Pengeringan Pascapanen", category: "Analisis", source: "extension.edu" },
      ],
      insight: "Jangan kejar harga puncak. Petani cabai yang menang menang lewat ketepatan waktu dan pengeringan — bukan sekadar menanam lebih banyak.",
    },
  },
};

export const FALLBACK: { agent: AgentKey } & Record<Lang, ResponsePayload> = {
  agent: "agronomist",
  en: {
    blocks: [
      { type: "h", text: "Here is how I would approach it" },
      { type: "p", text: "I have routed your question to the most relevant specialist agent and pulled together the practical steps below. Ask a follow-up any time and I will adapt the plan." },
      { type: "ul", items: ["Start from your soil, climate, and water access", "Choose crops that fit those constraints, not trends", "Plan in small, testable steps you can measure", "Track results so each season beats the last"] },
    ],
    citations: [
      { title: "AgriMind Knowledge Base", category: "Reference", source: "agrimind.ai" },
      { title: "Sustainable Practices Guide", category: "Agronomy", source: "fao.org" },
    ],
    insight: "Good farming decisions are local. The best general answer is the one you test on a small patch before scaling.",
  },
  id: {
    blocks: [
      { type: "h", text: "Begini cara saya menanganinya" },
      { type: "p", text: "Saya telah mengarahkan pertanyaan Anda ke agen spesialis yang paling relevan dan merangkum langkah praktis di bawah. Ajukan pertanyaan lanjutan kapan saja dan saya akan menyesuaikan rencananya." },
      { type: "ul", items: ["Mulai dari tanah, iklim, dan akses air Anda", "Pilih tanaman yang sesuai kondisi, bukan tren", "Rencanakan dalam langkah kecil yang bisa diukur", "Catat hasil agar tiap musim lebih baik"] },
    ],
    citations: [
      { title: "Basis Pengetahuan AgriMind", category: "Referensi", source: "agrimind.ai" },
      { title: "Panduan Praktik Berkelanjutan", category: "Agronomi", source: "fao.org" },
    ],
    insight: "Keputusan tani yang baik bersifat lokal. Jawaban umum terbaik adalah yang Anda uji di petak kecil sebelum memperluasnya.",
  },
};

export const HISTORY: Record<Lang, HistoryGroup[]> = {
  en: [
    { group: "Today", items: [{ id: "mock1", title: "Tomato leaf diagnosis" }, { id: "mock2", title: "Rainy-season calendar" }] },
    { group: "Yesterday", items: [{ id: "mock3", title: "Sandy soil crop picks" }, { id: "mock4", title: "Chili market outlook" }, { id: "mock5", title: "Soil pH basics" }] },
    { group: "Last 7 days", items: [{ id: "mock6", title: "Drip irrigation setup" }, { id: "mock7", title: "Composting starter" }] },
  ],
  id: [
    { group: "Hari ini", items: [{ id: "mock1", title: "Diagnosa daun tomat" }, { id: "mock2", title: "Kalender musim hujan" }] },
    { group: "Kemarin", items: [{ id: "mock3", title: "Pilihan tanaman tanah berpasir" }, { id: "mock4", title: "Prospek pasar cabai" }, { id: "mock5", title: "Dasar pH tanah" }] },
    { group: "7 hari terakhir", items: [{ id: "mock6", title: "Pemasangan irigasi tetes" }, { id: "mock7", title: "Mulai membuat kompos" }] },
  ],
};

export const PANEL: Record<Lang, PanelData> = {
  en: {
    insightTitle: "AgriMind Insight",
    insight: "Soil temperature, not the calendar date, is the real signal for when to sow. Aim for consistent warmth before planting heat-lovers.",
    topicsTitle: "Recommended Topics",
    topics: [
      { name: "Soil Health", tag: "Foundations" },
      { name: "Integrated Pest Management", tag: "Protection" },
      { name: "Efficient Irrigation", tag: "Water" },
      { name: "Crop Rotation", tag: "Planning" },
    ],
    knowledgeTitle: "Related Knowledge",
    knowledge: [
      { title: "Reading a Soil Test", source: "agrimind.ai", cat: "Guide" },
      { title: "Beneficial Insects 101", source: "extension.edu", cat: "Reference" },
    ],
    learningTitle: "Learning Path",
    learning: [
      { name: "Foundations of Soil", pct: 72 },
      { name: "Plant Disease ID", pct: 40 },
      { name: "Season Planning", pct: 15 },
    ],
  },
  id: {
    insightTitle: "Insight AgriMind",
    insight: "Suhu tanah, bukan tanggal kalender, adalah sinyal sebenarnya kapan menyemai. Pastikan kehangatan stabil sebelum menanam tanaman penyuka panas.",
    topicsTitle: "Topik Rekomendasi",
    topics: [
      { name: "Kesehatan Tanah", tag: "Fondasi" },
      { name: "Pengendalian Hama Terpadu", tag: "Proteksi" },
      { name: "Irigasi Efisien", tag: "Air" },
      { name: "Rotasi Tanaman", tag: "Perencanaan" },
    ],
    knowledgeTitle: "Pengetahuan Terkait",
    knowledge: [
      { title: "Membaca Hasil Uji Tanah", source: "agrimind.ai", cat: "Panduan" },
      { title: "Serangga Bermanfaat 101", source: "extension.edu", cat: "Referensi" },
    ],
    learningTitle: "Jalur Belajar",
    learning: [
      { name: "Dasar-dasar Tanah", pct: 72 },
      { name: "Identifikasi Penyakit Tanaman", pct: 40 },
      { name: "Perencanaan Musim", pct: 15 },
    ],
  },
};

export const STRINGS: Record<Lang, Strings> = {
  en: { newChat: "New Chat", search: "Search conversations", recent: "Chat History", settings: "Settings", heroTitle: "AgriMind AI", heroSub: "Your AI Agricultural Advisor", heroDesc: "Learn, diagnose, plan, and make better agricultural decisions.", suggested: "Start with a suggestion", composer: "Ask AgriMind anything about farming…", insights: "Insights", send: "Send", thinking: "Analyzing cultivation strategy…", sources: "Sources", online: "All agents online", user: "Aminju", plan: "Pro plan", you: "You", regenerate: "Regenerate", copy: "Copy", helpful: "Helpful" },
  id: { newChat: "Obrolan Baru", search: "Cari percakapan", recent: "Riwayat Obrolan", settings: "Pengaturan", heroTitle: "AgriMind AI", heroSub: "Penasihat Pertanian AI Anda", heroDesc: "Belajar, diagnosa, rencanakan, dan ambil keputusan pertanian lebih baik.", suggested: "Mulai dari saran", composer: "Tanya AgriMind apa saja soal pertanian…", insights: "Insight", send: "Kirim", thinking: "Menganalisis strategi budidaya…", sources: "Sumber", online: "Semua agen aktif", user: "Aminju", plan: "Paket Pro", you: "Anda", regenerate: "Buat ulang", copy: "Salin", helpful: "Membantu" },
};

export const disclaimerText: Record<Lang, string> = {
  en: "AgriMind AI can make mistakes. Verify critical decisions with a local expert.",
  id: "AgriMind AI bisa keliru. Verifikasi keputusan penting dengan ahli setempat.",
};
