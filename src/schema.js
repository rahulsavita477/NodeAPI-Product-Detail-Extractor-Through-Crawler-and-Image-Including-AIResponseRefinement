// The exact product shape we want the model to return.
// Keep this in one place so the prompt and the validation stay in sync.

export const PRODUCT_FIELDS = [
  "title",
  "description",
  "inTheBox",
  "price",
  "category",
  "brand",
  "specs",
  "features",
  "metaTitle",
  "metaDescription",
  "metaKeywords",
  "images",
  "videos",
];

// A human-readable description of every field. This is injected into the
// prompt so the model knows exactly what to put where.
export const FIELD_GUIDE = `
- title (string): Short, clean product name. e.g. "Sony WH-1000XM5 Wireless Headphones".
- description (string): 2-4 sentence marketing description of the product.
- inTheBox (string[]): Items included in the package. e.g. ["Headphones", "USB-C cable", "Carry case", "User manual"].
- price (object): { "amount": number|null, "currency": string|null }. Read it from the invoice/receipt/tag if visible, else null.
- category (string): Best-guess product category. e.g. "Audio > Headphones".
- brand (string): Manufacturer / brand name.
- specs (object): Key/value technical specifications. e.g. { "Battery Life": "30 hours", "Connectivity": "Bluetooth 5.2" }.
- features (string[]): Bullet-point selling features.
- metaTitle (string): SEO page title (<= 60 chars).
- metaDescription (string): SEO meta description (<= 160 chars).
- metaKeywords (string[]): SEO keywords.
- barcode (string|null): Any barcode / UPC / EAN number you can read in the images (digits only). null if none.
- images (string[]): Leave this as an empty array []. The caller fills it in with the actual file references.
- videos (string[]): Leave this as an empty array [].
`;

// A fully-empty product object, used as a safe fallback / default merge target.
export function emptyProduct() {
  return {
    title: "",
    description: "",
    inTheBox: [],
    price: { amount: null, currency: null },
    category: "",
    brand: "",
    specs: {},
    features: [],
    metaTitle: "",
    metaDescription: "",
    metaKeywords: [],
    barcode: null,
    images: [],
    videos: [],
  };
}

// Shallow-merge a (possibly partial) model response onto the empty template so
// callers always get every key, even if the model omitted some.
export function normalizeProduct(raw) {
  const base = emptyProduct();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...raw };
}
