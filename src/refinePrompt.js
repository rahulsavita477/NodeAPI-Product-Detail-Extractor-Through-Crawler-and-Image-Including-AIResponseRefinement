// Single source of truth for the output format + transform rules.
// Used by BOTH the image extractor (one vision call) and the crawler refine
// (one text call), so every source returns the exact same shape.

export const TARGET_FORMAT = `{
    "title": "",
    "description": "",
    "inTheBox": "",
    "price": "",
    "category": "",
    "brand": "",
    "specs": [{"attribute": "", "value": ""}],
    "features": ["", ""],
    "metaTitle": "",
    "metaDescription": "",
    "metaKeywords": [""]
}`;

export const REFINE_RULES = `Instructions:
    - Extract title, price, brand, and specs.
    - Remove attributes that are not useful for user understanding.
    - Rename confusing attributes into user‑friendly names.
    - Predict category as a generic type (Laptop, Smart Phone, Featured Phone, Apparel, Furniture, Gaming Console, Accessory).
    - Generate SEO‑friendly metaTitle, metaDescription, metaKeywords.
    - Output must be valid JSON only, no extra text.
    - price MUST be an integer only (digits, no currency symbol, no commas, no decimals, no text). If no price is found, use empty string.
    - Use empty string / empty array for anything you genuinely cannot find. Do not invent data.
    - If title, description, brand, specs, or features are missing, predict reasonable values using your own knowledge and the available raw JSON data (combine both). Base predictions on identifiable hints such as model number, barcode, title, or other specs.
    - Predictions must stay plausible and consistent with the product; do not fabricate prices, exact measurements, or unique identifiers you cannot infer. For those, use empty string / empty array.`;

// System prompt for the IMAGE extractor: one vision call that returns the
// target format directly (no separate refine step).
export const IMAGE_SYSTEM_PROMPT = `You are an expert e-commerce product data extractor.
You will be given one or more images of a single product (product photos, the
box/packaging, a barcode label, a spec sheet, and/or an invoice or receipt).
Study ALL the images together and return ONE JSON object in the EXACT format below.

${TARGET_FORMAT}

${REFINE_RULES}`;

// Prompt for refining an already-scraped raw product JSON (crawler data).
export function buildRefinePrompt(rawJson) {
  return `You are a JSON transformer. 
    Take ONLY the current raw JSON input and ignore any previous product context. 
    Return a refined JSON object in the exact format below:

    ${TARGET_FORMAT}

    ${REFINE_RULES}

    Raw JSON:
    ${JSON.stringify(rawJson)}`;
}