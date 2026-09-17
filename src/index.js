import "dotenv/config";

export { extractProduct } from "./extract.js";
export { decodeBarcodes, readFirstBarcode } from "./barcode.js";
export { emptyProduct, normalizeProduct, PRODUCT_FIELDS } from "./schema.js";
