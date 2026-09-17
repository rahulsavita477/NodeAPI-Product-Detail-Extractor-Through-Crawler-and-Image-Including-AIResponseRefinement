import { getActiveModels } from './groqModels.js';
import Groq from "groq-sdk";
import { parseJsonLoose } from "./extract.js";
import { buildRefinePrompt } from "./refinePrompt.js";

export async function refineJSONUsingAI(rawJson, options = {}) {

    const apiKey = options.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Missing Groq API key (GROQ_API_KEY).");
    const groq = new Groq({ apiKey });

    const messages = [{ role: "user", content: buildRefinePrompt(rawJson) }];
    const availableModels = await getActiveModels(); // models list fetch karein
    let completion = null;
    let content = "";
    let success = false;

    for (const currentModel of availableModels) {
        try {
            completion = await groq.chat.completions.create({
                model: currentModel,
                messages,
                temperature: 0.2,
                max_tokens: 4096,
            });

            content = completion.choices[0]?.message?.content ?? "";
            success = true; // Agar successfully data mil gaya toh flag true karo aur loop tod do
            break;

        } catch (err) {
            // Agar current model fail hota hai, toh warning print hogi aur loop agle model par chala jayega
            console.warn(`Model ${currentModel} failed: ${err.message}. Trying next fallback...`);
        }
    }

    // 3. Agar saare models fail ho jayein
    if (!success) {
        throw new Error("All fallback models failed to generate completion.");
    }

    const refined = parseJsonLoose(content);
    if (!refined) throw new Error("AI refine failed: invalid JSON from model");

    // Restore the original images/videos/price from the raw crawler data.
    // refined.images = images ?? [];
    // refined.videos = videos ?? [];
    // refined.price = price ?? '';

    // token estimation
    const inputTokens = completion?.usage?.prompt_tokens;
    const outputTokens = completion?.usage?.completion_tokens;
    const totalTokens = completion?.usage?.total_tokens;
    refined.token = {
        input_tokens: inputTokens, // Actual Input Tokens
        output_tokens: outputTokens, // Actual Response Output Tokens
        total_tokens: totalTokens
    }

    return refined;
}