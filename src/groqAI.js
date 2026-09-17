import Groq from "groq-sdk";
import { getActiveModels } from "./groqModels.js";

export async function callGroqWithFallback(
    messages,
    options = {}
) {
    const apiKey = options.apiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
        throw new Error("Missing Groq API key (GROQ_API_KEY).");
    }

    const groq = new Groq({ apiKey });

    /*
     * If a specific model is passed,
     * use only that model.
     *
     * Otherwise use active models as fallback.
     */
    const models = options.model
        ? [options.model]
        : await getActiveModels();

    if (!models.length) {
        throw new Error("No active Groq models available.");
    }

    let lastError = null;

    for (const currentModel of models) {

        try {

            const request = {
                model: currentModel,
                messages,
                temperature: options.temperature ?? 0.2,
                // max_tokens: options.max_tokens ?? 4096,
            };

            /*
             * response_format is optional.
             * Only add it when required.
             */
            if (options.response_format) {
                request.response_format = options.response_format;
            }

            const completion =
                await groq.chat.completions.create(request);

            const content =
                completion.choices[0]?.message?.content ?? "";

            return {
                completion,
                content,
                model: currentModel
            };

        } catch (err) {

            lastError = err;

            console.warn(
                `Model ${currentModel} failed: ${err.message}. ` +
                `Trying next fallback...`
            );
        }
    }

    throw new Error(
        `All Groq fallback models failed. ` +
        `${lastError?.message || ""}`
    );
}