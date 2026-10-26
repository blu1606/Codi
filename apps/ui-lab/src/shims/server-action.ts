import { lab } from "./lab-runtime";

/** Default answer for an action the state did not configure. */
const DEFAULT: { ok: unknown } = { ok: { success: true, ok: true } };

export async function callLabAction(name: string, args: unknown[]) {
  console.info(`[lab] server action ${name}`, args);
  await new Promise((r) => setTimeout(r, lab.actionDelayMs));
  const configured = lab.actions[name] ?? DEFAULT;
  const result = typeof configured === "function" ? configured(args) : configured;
  if ("error" in result) throw new Error(result.error);
  return result.ok;
}
