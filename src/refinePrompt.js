// Single source of truth for the output format + transform rules.
// Used by BOTH the image extractor (one vision call) and the crawler refine
// (one text call), so every source returns the exact same shape.

export const TARGET_FORMAT = `{
    "title": "",
    "description": "",
    "inTheBox": "",
    "category": "",
    "brand": "",
    "found_attributes": [{
      "att_id": 12,
      "att_name": "RAM",
      "scraped_name": "Memory & RAM",
      "att_value": "6 GB"
    }],
    "ambiguous_attributes": [{
      "att_id": 22,
      "att_name": "Front Camera",
      "scraped_name": "Secondary Camera",
      "att_value": "8 MP"
    }],
    "new_attributes": [{
      "scraped_name": "Cooling Tech",
      "att_value": "Vapor Chamber"
    }],
    "features": [""],
    "metaTitle": "",
    "metaDescription": "",
    "metaKeywords": [""]
}`;

export const REFINE_RULES = `Instructions:
    - Extract product title, brand, category, description, inTheBox, features (maximum 3 or 4 only), and specs from the input data.
    - Clean up raw scraped specifications: remove useless, redundant, or confusing attributes that do not add end-user value.
    - Rename technical or confusing scraped attribute names into clean, user-friendly names.
    - Compare scraped specs against the system attributes mapping provided in the 'attributes' key of Raw JSON (Format: { "att_id": "att_name" }).
    - Categorize mapped specifications into three strict groups: 'found_attributes', 'ambiguous_attributes', and 'new_attributes'.
    - Generate SEO-friendly metaTitle, metaDescription, and metaKeywords based on product details.
    - Output MUST be valid JSON only, matching the TARGET_FORMAT strictly with no extra text or markdown code blocks.

Prediction & Fallback Rules:
    - If specs or features are missing, predict reasonable values using identifiable hints from the available raw data (e.g., title, model number) combined with your knowledge.
    - Predictions MUST remain plausible and consistent with the product. Do NOT fabricate exact measurements, serial numbers, or unique identifiers you cannot infer—use empty string "" or empty array [] instead.

Attribute Classification Rules:
    1. 'found_attributes': Exact or clear synonym match with an attribute in 'attributes'.
       - Must include 'att_id' (extracted as integer or string key from 'attributes'), 'att_name' (value from 'attributes'), 'scraped_name', and 'att_value'.
    2. 'ambiguous_attributes': Partial, uncertain, or doubtful match with an attribute in 'attributes'.
       - Use 'att_id' and 'att_name' of the best-guessed attribute from 'attributes'.
    3. 'new_attributes': Scraped spec does NOT match any system attribute in 'attributes' but is valuable to users.
       - Only include 'scraped_name' and 'att_value' (Do NOT include att_id or att_name).`;

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
	return `You are a strict JSON transformer. 
    Take ONLY the current raw JSON input and ignore any previous product context. 
    Return a refined JSON object in the exact format below:

    ${TARGET_FORMAT}

    ${REFINE_RULES}

    Raw JSON Input:
    ${JSON.stringify(rawJson)}`;
}