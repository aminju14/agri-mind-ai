/** TASK 4 — Plant Doctor Agent module. */
import { makeAgent } from "./base-agent";
import { plantDoctorPersona } from "../prompts/plant-doctor.prompt";

export const plantDoctorAgent = makeAgent(plantDoctorPersona);
