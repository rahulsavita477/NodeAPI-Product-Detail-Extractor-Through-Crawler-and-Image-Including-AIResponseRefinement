import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let cachedModels = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 Ghanta cache

export async function getActiveModels() {
    const now = Date.now();

    // Agar cache available hai toh naya call nahi marega
    if (cachedModels && (now - lastFetchTime < CACHE_DURATION)) {
        return cachedModels;
    }

    try {
        const response = await groq.models.list();
        const models = response.data || [];

        // Sirf reliable general-purpose chat/text models filter karein
        const validModels = models
            .map(m => m.id)
            .filter(id => {
                const lowerId = id.toLowerCase();

                // 1. Unwanted/Specialized models ko exclude karein
                const isUnwanted =
                    lowerId.includes("prompt-guard") ||
                    lowerId.includes("whisper") ||
                    lowerId.includes("safeguard") ||
                    lowerId.includes("orpheus") ||
                    lowerId.includes("allam");

                // 2. Sirf mainstream chat model families ko allow karein
                const isGeneralChat =
                    lowerId.includes("llama") ||
                    lowerId.includes("mixtral") ||
                    lowerId.includes("gemma") ||
                    lowerId.includes("qwen");

                return !isUnwanted && isGeneralChat;
            });

        cachedModels = validModels.length > 0 ? validModels : ["llama-3.1-8b-instant"];
        lastFetchTime = now;

        return cachedModels;
    } catch (err) {
        console.warn("Could not fetch dynamic models, using backup list:", err.message);
        // Emergency static backup agar API down ho
        return ["llama-3.1-8b-instant", "llama-3.1-70b-versatile"];
    }
}