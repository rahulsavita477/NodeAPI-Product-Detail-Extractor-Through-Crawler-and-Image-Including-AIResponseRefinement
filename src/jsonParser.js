/**
 * Parse JSON even if the model wrapped it in markdown fences or added stray text.
 */
export function parseJsonLoose(text) {
    if (!text) return null;
    const trimmed = text.trim();

    // 1. Direct Parse
    try {
        return JSON.parse(trimmed);
    } catch { }

    // 2. Fenced Code Block Parse (```json ... ```)
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch { }
    }

    // 3. Extract JSON object ({...}) or Array ([...]) from text
    const firstObj = trimmed.indexOf("{");
    const lastObj = trimmed.lastIndexOf("}");
    const firstArr = trimmed.indexOf("[");
    const lastArr = trimmed.lastIndexOf("]");

    let start = -1;
    let end = -1;

    // Check karein ki Object pehle hai ya Array
    if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
        start = firstObj;
        end = lastObj;
    } else if (firstArr !== -1) {
        start = firstArr;
        end = lastArr;
    }

    if (start !== -1 && end !== -1 && end > start) {
        const jsonString = trimmed.slice(start, end + 1);
        try {
            return JSON.parse(jsonString);
        } catch {
            // Trailing comma clean karne ki koshish (e.g., [1, 2,] => [1, 2])
            try {
                const cleanedJson = jsonString.replace(/,\s*([\]}])/g, "$1");
                return JSON.parse(cleanedJson);
            } catch { }
        }
    }

    return null;
}