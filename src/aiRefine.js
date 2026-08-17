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
    const messages = [{role: "user", content: buildRefinePrompt(rawForAI)}];
    let content;
    let completion;

    try {    
        completion = await groq.chat.completions.create({
            model, messages, temperature: 0.2, max_tokens: 4096,
            response_format: { type: "json_object" },
        });
        content = completion.choices[0]?.message?.content ?? "";
    } catch {
        completion = await groq.chat.completions.create({
            model, messages, temperature: 0.2, max_tokens: 4096,
        });
        content = completion.choices[0]?.message?.content ?? "";
        // content=false;
    }
    const refined = parseJsonLoose(content);
    if (!refined) throw new Error("AI refine failed: invalid JSON from model");
    
    // refine price of product
    const match = price.match(/[\d,.]+/);
    if (match) {
        refined.price = match[0].replace(/,/g, '');
    } else {
        refined.price = "";
    }

    // Restore the original images/videos/price from the raw crawler data.
    refined.images = images ?? [];
    refined.videos = videos ?? [];
    refined.price = price ? parseInt(parseFloat(price.toString().replace(/,/g, '')), 10) : 0;

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