export type Lang = "en" | "id";
export type Theme = "dark" | "light";
export type View = "hero" | "chat";

export type AgentKey = "agronomist" | "plantdoctor" | "farmplanner" | "research";

export interface Agent {
  key: AgentKey;
  en: string;
  id: string;
  emoji: string;
  hue: number;
  color: string;
}

export type BlockType = "h" | "p" | "ul";
export interface Block {
  type: BlockType;
  text?: string;
  items?: string[];
}

export interface Citation {
  title: string;
  category: string;
  source: string;
  /** Optional source link target. Web citations carry a URL; KB citations may omit it. */
  url?: string;
}

export interface ResponsePayload {
  blocks: Block[];
  citations: Citation[];
  insight: string;
}

export type PromptIcon = "book" | "leaf" | "calendar" | "sprout" | "chart";

export interface PromptDef {
  key: string;
  agent: AgentKey;
  icon: PromptIcon;
  en: { title: string; desc: string; q: string };
  id: { title: string; desc: string; q: string };
}

export interface HistoryItem {
  id: string;
  title: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface HistoryGroup {
  group: string;
  items: HistoryItem[];
}

export interface PanelData {
  insightTitle: string;
  insight: string;
  topicsTitle: string;
  topics: { name: string; tag: string }[];
  knowledgeTitle: string;
  /** Related knowledge. `url` present for web sources (clickable); omitted for internal KB. */
  knowledge: { title: string; source: string; cat: string; url?: string }[];
  learningTitle: string;
  learning: { name: string; pct: number }[];
}

export interface Strings {
  newChat: string;
  search: string;
  recent: string;
  settings: string;
  heroTitle: string;
  heroSub: string;
  heroDesc: string;
  suggested: string;
  composer: string;
  insights: string;
  send: string;
  thinking: string;
  sources: string;
  online: string;
  user: string;
  plan: string;
  you: string;
  regenerate: string;
  copy: string;
  helpful: string;
}

/* ---- runtime message model ---- */
export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AiMessage {
  id: string;
  role: "ai";
  agentKey: AgentKey;
  blocks: Block[];
  citations: Citation[];
  insight: string;
  reveal: { block: number; char: number };
  done: boolean;
  showExtras: boolean;
}

export type Message = UserMessage | AiMessage;
