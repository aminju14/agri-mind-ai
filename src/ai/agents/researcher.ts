/** TASK 4 — Research Agent module. */
import { makeAgent } from "./base-agent";
import { researcherPersona } from "../prompts/researcher.prompt";

export const researcherAgent = makeAgent(researcherPersona);
