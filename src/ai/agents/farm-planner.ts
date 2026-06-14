/** TASK 4 — Farm Planner Agent module. */
import { makeAgent } from "./base-agent";
import { farmPlannerPersona } from "../prompts/farm-planner.prompt";

export const farmPlannerAgent = makeAgent(farmPlannerPersona);
