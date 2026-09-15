import Groq from "groq-sdk";
import { parseJsonLoose } from "./extract.js";
import { buildRefinePrompt } from "./refinePrompt.js";

const DEFAULT_MODEL = process.env.GROQ_MODEL;

export async function refineJSONUsingAI(rawJson, options = {}) {

    const apiKey = options.apiKey || process.env.GROQ_API_KEY;

    if (!apiKey) throw new Error("Missing Groq API key (GROQ_API_KEY).");

    const model = options.model || DEFAULT_MODEL;
    const groq = new Groq({ apiKey });

    // Don't send images/videos/price to the AI (saves tokens; AI shouldn't touch URLs).
    // Keep the originals and add them back to the refined result afterwards.
    const { images, videos, price, ...rawForAI } = rawJson || {};
    const messages = [{ role: "user", content: buildRefinePrompt(rawForAI) }];
    let completion = null;
    let content = "";
    let success = false;
    const fallbackModels = [
        model,                          // Pehla: Aapka primary model
        "llama-3.1-70b-versatile",      // Dusra fallback
        "llama-3.1-8b-instant",         // Teesra fallback
        "mixtral-8x7b-32768"            // Chautha fallback
    ];

    for (const currentModel of fallbackModels) {
        try {
            completion = await groq.chat.completions.create({
                model: currentModel,
                messages,
                temperature: 0.2,
                max_tokens: 4096,
            });

            content = completion.choices[0]?.message?.content ?? "";

            // Agar successfully data mil gaya toh flag true karo aur loop tod do
            success = true;
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
    refined.images = images ?? [];
    refined.videos = videos ?? [];
    refined.price = price ?? '';

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