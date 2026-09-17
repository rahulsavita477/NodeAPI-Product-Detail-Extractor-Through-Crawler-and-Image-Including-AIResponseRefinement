import { buildRefinePrompt } from "./refinePrompt.js";
import { parseJsonLoose } from "./jsonParser.js";
import { callGroqWithFallback } from "./groqAI.js";

export async function refineJSONUsingAI(rawJson, options = {}) {

    const messages = [{
        role: "user",
        content: buildRefinePrompt(rawJson)
    }];

    const result = await callGroqWithFallback(messages, {
        apiKey: options.apiKey,
        model: options.model,
        temperature: 0.2,
        // max_tokens: 4096,
        // response_format: {
        //     type: "json_object"
        // }
    });

    const refined = parseJsonLoose(result.content);

    if (!refined) {
        throw new Error(
            "AI refine failed: invalid JSON from model"
        );
    }

    /*
     * Token usage
     */
    const inputTokens = result.completion?.usage?.prompt_tokens;
    const outputTokens = result.completion?.usage?.completion_tokens;
    const totalTokens = result.completion?.usage?.total_tokens;

    refined.token = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens
    };

    /*
     * Optional: keep which model actually succeeded
     */
    refined.ai_model = result.model;

    return refined;
}