import { createHash } from "node:crypto";

const processedProducts = new Set();

export function checkDuplicate(key) {
    const input = typeof key === "string" ? key : JSON.stringify(key);
    const hash = createHash("sha256").update(input).digest("hex");

    if (processedProducts.has(hash)) {
        return {
            message: "This product JSON appears to be a duplicate of a previously processed item.",
            error: true
        };
    }
    processedProducts.add(hash);
    return { message: "No issues detected.", error: false };
}

// Build a stable key from one or more image buffers (for /api/extract).
export function imageKey(buffers) {
    const h = createHash("sha256");
    for (const b of buffers) h.update(b);
    return h.digest("hex");
}