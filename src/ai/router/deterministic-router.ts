/**
 * Deterministic keyword router (AGENTS §13).
 *
 * Pure, fast (<1ms), no I/O, no LLM. Used two ways by the routing service:
 *   1. PREFILTER — a high-confidence keyword hit can route without a Claude call.
 *   2. FALLBACK  — if the LLM supervisor fails/produces junk, fall back here.
 *
 * Returns canonical AgentKey + scores for explainability/analytics.
 */

import type { Lang } from "@/lib/types";
import { CANONICAL_AGENTS, type AgentKey } from "../types";

export interface DeterministicResult {
  agent: AgentKey;
  reason: string;
  scores: Record<AgentKey, number>;
  /** Margin between top and 2nd score — drives prefilter confidence. */
  margin: number;
  /** Top agent's score (includes bias only if the top agent is agronomist). */
  topScore: number;
  /** Runner-up's score (may include the agronomist bias floor). */
  secondScore: number;
  /**
   * True when exactly one agent matched real lexicon signals (the others scored 0
   * before the bias floor). A clean single-domain hit the prefilter can trust without
   * an LLM call.
   */
  cleanWinner: boolean;
}

/** A small floor so agronomist wins ties on a truly empty signal (AGENTS §13.2 step 4). */
export const BASE_BIAS = 0.1;
/** Specificity preference for the tiebreak (AGENTS §13.2 step 5). */
const SPECIFICITY: AgentKey[] = ["plantdoctor", "research", "farmplanner", "agronomist"];

interface Signal {
  re: RegExp;
  weight: number;
}

/**
 * Bilingual lexicon (EN + ID), weighted. Strong signals 1.0, medium 0.6 (AGENTS §13.3).
 * Word-boundary-ish matching; ID terms included inline.
 */
const LEXICON: Record<AgentKey, Signal[]> = {
  plantdoctor: [
    { re: /\b(disease|blight|fungus|jamur|rot|busuk|pest|hama|wilt(ing)?|layu)\b/i, weight: 1.0 },
    { re: /\b(spot|spots|bercak|yellowing|menguning|curl(ing)?|keriting|mold|jamur)\b/i, weight: 1.0 },
    { re: /\b(symptom|gejala|infection|infeksi|larvae|ulat|deficien(t|cy)|kekurangan hara)\b/i, weight: 0.6 },
  ],
  farmplanner: [
    { re: /\b(calendar|kalender|schedule|jadwal|rotation|rotasi|season|musim)\b/i, weight: 1.0 },
    { re: /\b(budget|anggaran|cost|biaya|profit(able)?|untung|menguntungkan|roi|return)\b/i, weight: 1.0 },
    { re: /\b(when to plant|kapan tanam|what should i plant|tanam apa|stagger|bertahap|nursery|persemaian)\b/i, weight: 1.0 },
    { re: /\b(timeline|planting window|estimate|estimasi|plan(ning)?|rencana)\b/i, weight: 0.6 },
  ],
  research: [
    { re: /\b(market|pasar|price|harga|demand|permintaan|outlook|prospek|trend|tren)\b/i, weight: 1.0 },
    { re: /\b(research|riset|penelitian|study|studi|report|laporan|scientific|ilmiah)\b/i, weight: 1.0 },
    { re: /\b(export|ekspor|supply|pasokan|statistic|statistik)\b/i, weight: 0.6 },
  ],
  agronomist: [
    { re: /\b(soil|tanah|ph|fertiliz(er|e)|pupuk|compost|kompos|drainage|drainase)\b/i, weight: 1.0 },
    { re: /\b(grow|tanam|cultivat|budidaya|irrigat(e|ion)|irigasi|harvest|panen)\b/i, weight: 1.0 },
    { re: /\b(how to start|cara memulai|crop management|perawatan|sunlight|matahari|bed|bedengan)\b/i, weight: 0.6 },
  ],
};

function emptyScores(): Record<AgentKey, number> {
  return { agronomist: 0, plantdoctor: 0, farmplanner: 0, research: 0 };
}

function morePreferred(a: AgentKey, b: AgentKey): AgentKey {
  return SPECIFICITY.indexOf(a) <= SPECIFICITY.indexOf(b) ? a : b;
}

/** Score a message against the lexicon and pick the best agent (AGENTS §13.2). */
export function routeDeterministic(text: string, _lang: Lang): DeterministicResult {
  // Raw lexicon scores (before any bias) — used for the "clean winner" check.
  const raw = emptyScores();
  for (const agent of CANONICAL_AGENTS) {
    for (const sig of LEXICON[agent]) {
      if (sig.re.test(text)) raw[agent] += sig.weight;
    }
  }
  // Final scores add the agronomist bias floor (tiebreak on empty signal).
  const scores = { ...raw, agronomist: raw.agronomist + BASE_BIAS };

  const ranked = [...CANONICAL_AGENTS].sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0];
  const second = ranked[1];
  const topScore = scores[top];
  const secondScore = scores[second];
  const margin = topScore - secondScore;

  // A clean winner = exactly one agent matched real signals (others raw==0).
  const agentsWithSignal = CANONICAL_AGENTS.filter((a) => raw[a] > 0);
  const cleanWinner = agentsWithSignal.length === 1 && agentsWithSignal[0] === top;

  const base = { scores, margin, topScore, secondScore, cleanWinner };

  // no real signal beyond the bias floor → default
  if (topScore <= BASE_BIAS) {
    return { agent: "agronomist", reason: "default:no-signal", ...base, cleanWinner: false };
  }

  // close call → prefer the more specific agent if it matched at all
  if (margin < 0.15 && raw[second] > 0) {
    const pick = morePreferred(top, second);
    return { agent: pick, reason: "tiebreak-specificity", ...base };
  }

  return { agent: top, reason: `lexicon:${top}`, ...base };
}
