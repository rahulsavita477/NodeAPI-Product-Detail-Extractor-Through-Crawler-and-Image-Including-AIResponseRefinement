import Groq from "groq-sdk";
import { parseJsonLoose } from "./extract.js";
import { buildRefinePrompt } from "./refinePrompt.js";

const DEFAULT_MODEL =
    process.env.GROQ_TEXT_MODEL ||
    process.env.GROQ_MODEL ||
    "meta-llama/llama-4-scout-17b-16e-instruct";

export async function refineJSONUsingAI(rawJson, options = {}) {
    const apiKey = options.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Missing Groq API key (GROQ_API_KEY).");
    const model = options.model || DEFAULT_MODEL;
    const groq = new Groq({ apiKey });
    // Don't send images/videos to the AI (saves tokens; AI shouldn't touch URLs).
    // Keep the originals and add them back to the refined result afterwards.
    const { images, videos, ...rawForAI } = rawJson || {};
    const messages = [{ role: "user", content: buildRefinePrompt(rawForAI) }];
    let content;
    try {
        const c = await groq.chat.completions.create({
            model, messages, temperature: 0.2, max_tokens: 4096,
            response_format: { type: "json_object" },
        });
        content = c.choices[0]?.message?.content ?? "";
    } catch {
        const c = await groq.chat.completions.create({
            model, messages, temperature: 0.2, max_tokens: 4096,
        });
        content = c.choices[0]?.message?.content ?? "";
    }
    const refined = parseJsonLoose(content);
    if (!refined) throw new Error("AI refine failed: invalid JSON from model");
    
    // Restore the original images/videos from the raw crawler data.
    refined.images = images ?? [];
    refined.videos = videos ?? [];
    return refined;
}