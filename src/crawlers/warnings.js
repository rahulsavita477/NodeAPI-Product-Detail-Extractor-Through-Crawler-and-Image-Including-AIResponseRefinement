// Validation helper used by the crawlers (your original addWarnings).
// Flags any string field that is blank or any array field that is empty.

export function addWarnings(productData) {
    const warnings = [];
    Object.keys(productData).forEach(key => {
        if (typeof productData[key] === "string" && productData[key].trim() === "") {
            warnings.push(`${key} is blank`);
        }
        if (Array.isArray(productData[key]) && productData[key].length === 0) {
            warnings.push(`${key} is blank`);
        }
    });
    productData.warnings = warnings;
    return productData;
}
