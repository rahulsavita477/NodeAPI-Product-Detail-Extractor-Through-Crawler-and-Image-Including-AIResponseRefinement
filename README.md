# product-extractor

Product images, packaging, barcode aur invoice/receipt photos se **structured product details (JSON)** nikalne ke liye ek chhota Node.js library + CLI. Vision model ke liye **Groq** use karta hai (free tier available) aur barcodes ko offline decode karta hai.

## Output schema

```jsonc
{
  "title": "AuraSound AS-700 Wireless Over-Ear Headphones",
  "description": "...",
  "inTheBox": ["Headphones", "USB-C cable", "..."],
  "price": { "amount": 8848.82, "currency": "INR" },
  "category": "Audio > Headphones",
  "brand": "AuraSound",
  "specs": { "Battery Life": "40 hours", "Bluetooth": "5.3" },
  "features": ["Active Noise Cancelling", "..."],
  "metaTitle": "...",
  "metaDescription": "...",
  "metaKeywords": ["headphones", "..."],
  "barcode": "8901234567890",
  "images": ["product.png", "invoice.png"],
  "videos": []
}
```

> `images` me aapki input image filenames automatically bhar di jaati hain. `videos` hamesha `[]` hota hai (images se video nahi nikal sakte). `barcode` field bonus hai — agar kisi image me barcode hai to decode karke add ho jaata hai.

## Setup

```bash
npm install
cp .env.example .env
# .env me apni key daalein — free key: https://console.groq.com/keys
```

```dotenv
GROQ_API_KEY=gsk_...
```

## Run as an API server (for the Angular UI)

```bash
npm run server     # http://localhost:3000
```

Ye **gateway** teeno sources ko serve karta hai:
- `GET  /api/health` → `{ ok, hasKey }`
- `POST /api/extract` → `multipart/form-data` with one or more `images` files (image → JSON)
- `POST /api/flipkart` → JSON `{ "url": "..." }` (Flipkart URL → JSON)
- `POST /api/amazon` → JSON `{ "url": "..." }` (Amazon URL → JSON)

```bash
curl -X POST http://localhost:3000/api/extract \
  -F "images=@examples/images/product.png" \
  -F "images=@examples/images/invoice.png" \
  -F "images=@examples/images/barcode.png"

curl -X POST http://localhost:3000/api/flipkart -H "Content-Type: application/json" \
  -d '{"url":"https://www.flipkart.com/..."}'
```

### Crawlers (Flipkart / Amazon)
Crawler logic alag modules me hai — apna crawler code yahan paste karein:
- `src/crawlers/flipkart.js` → `crawlFlipkart(url)` must return a JSON object
- `src/crawlers/amazon.js` → `crawlAmazon(url)` must return a JSON object

Jab tak code paste nahi hota, ye endpoints ek clear "not implemented" error dete hain. Return shape ideally image schema jaisa rakhein (title, price, specs, ...) taaki UI ka product card bhi render ho; warna UI sirf raw JSON dikha dega.

### Duplicate detection
Har response me ek `isDuplicate` field add hota hai. Gateway (`src/dedupe.js`) product JSON ka SHA-256 hash rakhta hai aur agar wahi product dobara aaye to `{ error: true, message: "...duplicate..." }` deta hai (server restart tak in-memory). Teeno endpoints (`/api/extract`, `/api/flipkart`, `/api/amazon`) pe lagता hai.

> Angular frontend alag directory me hai (`product-ui/`). CORS already enabled hai.

## Use as a CLI

```bash
node src/cli.js examples/images/product.png examples/images/invoice.png examples/images/barcode.png
# JSON file me save karna ho:
node src/cli.js ./photos/*.jpg --out result.json
```

## Use as a library

```js
import { extractProduct } from "./src/index.js";

const product = await extractProduct([
  "photos/product.jpg",
  "photos/box.jpg",
  "photos/invoice.jpg",
  "photos/barcode.jpg",
]);

console.log(product.title, product.price);
```

`extractProduct(imagePaths, options)` options:

| option        | default                                      | kya karta hai                                  |
| ------------- | -------------------------------------------- | ---------------------------------------------- |
| `apiKey`      | `process.env.GROQ_API_KEY`                   | Groq API key                                   |
| `model`       | `meta-llama/llama-4-scout-17b-16e-instruct`  | koi bhi Groq vision model                      |
| `scanBarcodes`| `true`                                       | offline barcode decoder on/off                 |

## Try it instantly (sample images included)

Repo me ready-made test images hain (`examples/images/`): ek product photo, spec sheet, invoice, aur ek real scannable barcode.

```bash
npm run demo
```

Ye sab 4 images ek saath model ko deta hai aur combined JSON print karta hai (price invoice se, specs spec-sheet se, barcode label se — sab merge hoke).

Apne khud ke sample images banane ho to:

```bash
npm install --no-save bwip-js
node examples/generate-samples.js
```

## Best practices for good results

- **Ek product, multiple angles**: ek call me ek hi product ki saari images bhejein (front, back, box, invoice, barcode). Model unhe combine karke fill karta hai.
- **Price ke liye invoice/receipt ya price tag** zaroor include karein, warna `price` null aayega.
- **Barcode ke liye saaf, seedha photo** dein — offline decoder pehle try karta hai, na pade to model visible digits padhne ki koshish karta hai.
- **Images clear ho** — blurry/cropped text se accuracy girti hai.

## How it works

1. `zbar-wasm` se har image me barcode/QR offline decode hota hai (reliable digits).
2. Saari images ek multimodal message me Groq vision model ko jaati hain, ek strict JSON schema ke saath.
3. Response normalize hota hai (har key guaranteed), `images` aur decoded `barcode` backfill hote hain.
```

## License

MIT
