/** TASK 4 — Agronomist Agent module. */
import { makeAgent } from "./base-agent";
import { agronomistPersona } from "../prompts/agronomist.prompt";

export const agronomistAgent = makeAgent(agronomistPersona);
