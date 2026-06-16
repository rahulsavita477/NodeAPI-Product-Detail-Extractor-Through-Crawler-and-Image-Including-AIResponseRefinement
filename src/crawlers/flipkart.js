import { get } from 'node:https';
import { chromium } from 'playwright';
import { addWarnings } from "./warnings.js";
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
            let html = '';
            res.on('data', (chunk) => (html += chunk));
            res.on('end', () => resolve(html));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function fetchWithPlaywright(url) {
    try {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        // Wait briefly for dynamic multimedia (iframes/background images) to load

        // ✅ "more" button detect karke click karo (agar exist karta)
        try {
            await page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button, span, a, div'))
                    .find(el => /more|read more|show more/i.test(el.innerText));
                if (button && typeof button.click === 'function') {
                    button.click();
                }
            });
            await page.waitForTimeout(1000);
        } catch (e) {
            // Button nahi mila, ignore
        }

        await page.waitForSelector('iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"], [style*="background-image"]', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);

        const data = await page.evaluate(() => {
            let title = '';
            // og:title / twitter:title carry the full, untruncated product name on Flipkart.
            // The visible h1 can contain a "...more" toggle, so prefer the meta tags first.
            title = document.querySelector('meta[property="og:title"]')?.content?.trim() ||
                    document.querySelector('meta[name="twitter:title"]')?.content?.trim() || '';
            if (!title) {
                const titleEl = document.querySelector('[data-title], [data-product-title]');
                title = titleEl?.getAttribute('data-title')?.trim() || titleEl?.textContent?.trim() || '';
            }
            if (!title) {
                const h1 = document.querySelector('h1');
                if (h1) {
                    title = h1.textContent?.trim() || '';
                }
            }
            if (!title) {
                title = document.title?.trim() || '';
            }
            // Clean up Flipkart's SEO wrapping and "...more" toggle text.
            title = title
                // og:title is often "Buy <name> Online at Best Prices ... | Flipkart.com"
                .replace(/^\s*buy\s+/i, '')
                .replace(/\s+online\s+at\b.*$/i, '')
                .replace(/\s*[|\-\u2013\u2014:]\s*flipkart\.com.*$/i, '')
                .replace(/\s*[|\-\u2013\u2014]\s*(price in india|reviews|specifications|best price).*$/i, '')
                // strip any "...more" / "…more" toggle text and trailing ellipses
                .replace(/[\s.\u2026]*\bmore\s*$/i, '')
                .replace(/[.\u2026]+$/, '')
                .trim();

            // The current selling price is the most prominent (largest font) standalone
            // "₹<amount>" on the page. Flipkart always renders it bigger than the MRP,
            // the discount %, the "Buy at" offer price and the ad/recommendation prices.
            let price = '';
            const priceNodes = Array.from(document.querySelectorAll('div, span, h1, h2'))
                .filter(el => /^₹[\d,]+$/.test((el.innerText || '').trim()))
                .map(el => ({
                    text: el.innerText.trim(),
                    fontSize: parseFloat(getComputedStyle(el).fontSize) || 0
                }))
                .sort((a, b) => b.fontSize - a.fontSize);
            if (priceNodes.length > 0) {
                price = priceNodes[0].text;
            }
            // Fallback: the main buy box (it uniquely contains "Apply offers"/"Lowest price").
            if (!price) {
                const mainBox = Array.from(document.querySelectorAll('div, span'))
                    .filter(el => /apply offers for maximum savings|lowest price for you|bank offers/i.test(el.innerText || '') && /₹\s*[\d,]+/.test(el.innerText || ''))
                    .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
                const m = mainBox && mainBox.innerText.match(/₹\s*([\d,]+)/);
                if (m) price = '₹' + m[1].trim();
            }
            // Keep full body text so downstream breadcrumb/brand/category parsing still works.
            const priceText = document.body.innerText || '';

            // Get all images that have rukminim and xif0q pattern (product images)
            const allImages = Array.from(document.querySelectorAll('img'))
                .map(img => img.src)
                .filter(url => url && url.includes('rukminim') && url.includes('xif0q'))
                .filter((url, idx, arr) => arr.indexOf(url) === idx);
            
            // Extract the product code from the first image (e.g., "imahft6c" from "-original-imahft6chnx2vbuy")
            let productCodePrefix = '';
            if (allImages.length > 0) {
                const match = allImages[0].match(/-original-([a-z0-9]+)/);
                if (match) {
                    productCodePrefix = match[1].substring(0, 8); // Get first 8 chars like "imahft6c"
                }
            }
            
            // Filter to only images with the same product code prefix
            const filteredImages = productCodePrefix ? 
                allImages.filter(url => url.includes(`-original-${productCodePrefix}`)) : 
                allImages;
            
            // const priceText = document.body.innerText || '';
            
            const videos = [];
            Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed"], iframe[src*="youtube-nocookie.com/embed"]')).forEach(f => {
                try {
                    const src = f.getAttribute('src') || '';
                    const m = src.match(/embed\/([a-zA-Z0-9_-]+)/);
                    const id = m ? m[1] : null;
                    const watchUrl = id ? `https://www.youtube.com/watch?v=${id}` : src;
                    const thumbnail = id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
                    videos.push({ embedUrl: src, watchUrl, id, thumbnail });
                } catch (e) {}
            });

            const youtubeThumbnails = Array.from(document.querySelectorAll('img'))
                .map(img => img.src)
                .filter(url => url && url.includes('img.youtube.com/vi/'))
                .filter((url, idx, arr) => arr.indexOf(url) === idx);
            
            return { title, price, images: filteredImages, priceText, videos, youtubeThumbnails };
        });

        // The plain HTTPS fetch for window.__INITIAL_STATE__ is often blocked by
        // Flipkart's bot protection (403 + reCAPTCHA). The headless browser is
        // not blocked, so read the same state from the rendered page as a fallback.
        // It can load late (or be absent), so wait briefly for it.
        await page.waitForFunction(() => !!window.__INITIAL_STATE__, { timeout: 5000 }).catch(() => {});
        const initialState = await page
            .evaluate(() => (typeof window !== 'undefined' ? window.__INITIAL_STATE__ || null : null))
            .catch(() => null);

        await browser.close();
        return { ...data, initialState };
    } catch (e) {
        console.error('Playwright error:', e.message);
        return { title: '', price: '', images: [], videos: [], priceText: '', initialState: null };
    }
}

function extractInitialState(html) {
    const startKey = 'window.__INITIAL_STATE__ = ';
    const start = html.indexOf(startKey);
    if (start === -1) return null;
    let i = html.indexOf('{', start + startKey.length);
    if (i === -1) return null;
    let depth = 0, inString = false, escapeNext = false;
    for (; i < html.length; i++) {
        const ch = html[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === '\\') { escapeNext = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return html.slice(html.indexOf('{', start + startKey.length), i + 1);
            }
        }
    }
    return null;
}

function parseLabelText(node) {
    if (!node || !node.value) return '';
    const text = node.value.text;
    if (Array.isArray(text)) return text.join(' ').trim();
    if (typeof text === 'string') return text.trim();
    return '';
}

function parseSpecValue(row) {
    const candidates = [];
    Object.keys(row || {}).forEach((key) => {
        if (key.startsWith('label_') && key !== 'label_0') {
            const text = parseLabelText(row[key]);
            if (text) candidates.push(text);
        }
    });
    return candidates.find(Boolean) || '';
}

function normalizeFlipkartImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    return url
        .replace(/\{\@width\}\/\{\@height\}/g, '800/1070')
        .replace(/\{\@quality\}/g, '90')
        .replace(/^(https?:)\/+/, '$1//');
}

function extractGalleryImagesFromState(state) {
    const slots = state?.multiWidgetState?.widgetsData?.slots;
    const imageUrls = [];
    if (Array.isArray(slots)) {
        for (const slot of slots) {
            const mediaItems = slot?.slotData?.widget?.data?.dlsData?.multiMediaViewData_0?.value;
            if (!Array.isArray(mediaItems) || mediaItems.length === 0) continue;

            mediaItems.forEach(item => {
                const url = item?.value?.image_0?.value?.selected?.value?.dynamicImageUrl;
                if (url) {
                    imageUrls.push(normalizeFlipkartImageUrl(url));
                }
            });

            if (imageUrls.length > 0) break;
        }
    }

    if (imageUrls.length === 0) {
        const seoImages = state?.multiWidgetState?.pageDataResponse?.seoData?.schema?.[0]?.image;
        if (Array.isArray(seoImages)) {
            seoImages.forEach(url => {
                if (url) imageUrls.push(normalizeFlipkartImageUrl(url));
            });
        }
    }

    return imageUrls.filter((url, index, arr) => url && arr.indexOf(url) === index);
}

function findObject(obj, predicate, seen = new Set()) {
    if (!obj || typeof obj !== 'object') return null;
    if (seen.has(obj)) return null;
    seen.add(obj);
    if (predicate(obj)) return obj;
    for (const key of Object.keys(obj)) {
        const found = findObject(obj[key], predicate, seen);
        if (found) return found;
    }
    return null;
}

function parseSpecs(state) {
    const widget = findObject(state, (obj) => {
        const hasTitleDirect = obj && obj.contentTitle === 'Specifications';
        const hasTitleTracking =
            obj && obj.value && obj.value.trackerData_0 &&
            obj.value.trackerData_0.tracking &&
            obj.value.trackerData_0.tracking.contentTitle === 'Specifications';
        const hasGrid =
            obj && obj.value && obj.value.gridData_0 &&
            Array.isArray(obj.value.gridData_0.value);
        return (hasTitleDirect || hasTitleTracking) && hasGrid;
    });

    if (!widget) return null;

    const layout = widget.value.gridData_0.value;
    const sections = [];

    layout.forEach((sectionWrapper) => {
        const section = sectionWrapper && sectionWrapper.value;
        if (!section) return;
        const sectionTitle = parseLabelText(section.label_0) || 'Specifications';
        const rows = (section.rpd_grid_0 &&
            section.rpd_grid_0.value &&
            section.rpd_grid_0.value.gridData_0 &&
            section.rpd_grid_0.value.gridData_0.value) || [];
        const items = [];
        rows.forEach((rowWrapper) => {
            const row = rowWrapper && rowWrapper.value;
            if (!row) return;
            const name = parseLabelText(row.label_0);
            const value = parseSpecValue(row);
            if (name && value) items.push({ attribute: name, value });
        });
        if (items.length > 0) sections.push({ title: sectionTitle, specs: items });
    });

    return sections;
}

export async function scrapeFlipkart(url) {
    // Fetch rendered page data for title, price, images (and __INITIAL_STATE__).
    console.log("🌐 Loading rendered page...");
    const playwrightData = await fetchWithPlaywright(url);

    // Try the lightweight HTML fetch for __INITIAL_STATE__ (specs). It is often
    // blocked by Flipkart's bot protection, so treat failures as non-fatal and
    // fall back to the state captured from the rendered page.
    let state = null;
    try {
        const html = await fetchHtml(url);
        const jsonText = extractInitialState(html);
        if (jsonText) state = JSON.parse(jsonText);
    } catch (e) {
        console.warn("Flipkart initial-state HTML fetch failed:", e.message);
    }
    if (!state && playwrightData.initialState) {
        state = playwrightData.initialState;
    }
    // If we still have no rich state AND the rendered page gave us nothing usable,
    // the page was genuinely blocked (reCAPTCHA). Otherwise continue with whatever
    // the rendered page provided (title/price/images) and skip state-only fields.
    if (!state && !playwrightData.title && (playwrightData.images || []).length === 0) {
        throw new Error("Could not extract Flipkart product data (page blocked).");
    }
    const multiWidgetState = (state && (state.multiWidgetState || state)) || {};

    // ✅ Extract title from Playwright (rendered page)
    const title = playwrightData.title || "";

    // ✅ Extract price — the main selling price captured from the rendered page
    let price = "";
    if (playwrightData.price) {
        price = playwrightData.price.trim();
    }
    if (!price && playwrightData.priceText) {
        // Fallback: prefer the selling price shown next to the discount %, else first ₹
        const sellingMatch = playwrightData.priceText.match(/\d+%\s*off?[^₹]*₹\s*([\d,]+)/i);
        const priceMatch = sellingMatch || playwrightData.priceText.match(/₹[\s]*([\d,]+)/);
        if (priceMatch) {
            price = "₹" + priceMatch[1].trim();
        }
    }

    // ✅ Extract description
    let description = "";

    // ✅ Brand & Category
    let brand = "";
    let category = "";
    
    if (playwrightData.priceText) {
        // Look for brand in breadcrumb path
        const breadcrumbMatch = playwrightData.priceText.match(/Mobiles & Accessories[^]*?\/([^\/\n]+)\/([^\n]+)/);
        if (breadcrumbMatch) {
            category = breadcrumbMatch[1].trim();
            brand = breadcrumbMatch[2].trim().split('\n')[0];
        }
        
        // If not found, look for Apple
        if (!brand && playwrightData.priceText.includes('Apple')) {
            brand = 'Apple';
        }
    }
    
    // Fallback from multiWidgetState
    if (!brand) {
        brand = findObject(multiWidgetState, (obj) => 
            (obj?.attribute === 'Brand' && obj?.value) ||
            (obj?.brandValue && typeof obj.brandValue === 'string')
        )?.value || "";
    }
    
    if (!category) {
        category = findObject(multiWidgetState, (obj) => 
            obj?.category || (obj?.categoryName && typeof obj.categoryName === 'string')
        )?.category || "";
    }

    // ✅ Images from Flipkart initial state gallery first, fallback to Playwright DOM if needed
    let imageUrls = extractGalleryImagesFromState(state);
    if (imageUrls.length === 0) {
        imageUrls = (playwrightData.images || [])
            .filter(url => url && typeof url === 'string' && url.includes('http') && !url.includes('youtube') && url.includes('rukminim') && url.includes('/image/'))
            .filter((url, index, arr) => arr.indexOf(url) === index);
    }

    const images = imageUrls.map(url => ({
        thumbnail: url.replace(/\/\d+\/\d+\//, '/80/110/'),
        url
    }));

    // ✅ Videos
    const videos = [];
    // Map playwright videos to our output format (dedupe by id or url)
    const seenVideos = new Set();
    (playwrightData.videos || []).forEach(v => {
        const vid = v.id || v.watchUrl || v.embedUrl || v.thumbnail;
        if (!vid || seenVideos.has(vid)) return;
        seenVideos.add(vid);
        const outUrl = v.watchUrl || v.embedUrl || null;
        const thumb = v.thumbnail || null;
        videos.push({ id: v.id || null, url: outUrl, embedUrl: v.embedUrl || null, thumbnail: thumb });
    });

    // If no iframe-detected videos, try to detect YouTube from YouTubeThumbnails
    if (videos.length === 0) {
        (playwrightData.youtubeThumbnails || []).forEach(img => {
            try {
                const m = img.match(/img\.youtube\.com\/vi\/([a-zA-Z0-9_-]+)/);
                if (m && m[1] && !seenVideos.has(m[1])) {
                    seenVideos.add(m[1]);
                    videos.push({ id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}`, embedUrl: `https://www.youtube.com/embed/${m[1]}`, thumbnail: img });
                }
            } catch (e) {}
        });
    }

    // ✅ Features
    const features = [];
    const featuresWidget = findObject(multiWidgetState, (obj) =>
        Array.isArray(obj?.keyFeatures) || Array.isArray(obj?.features)
    );
    if (featuresWidget?.keyFeatures) {
        features.push(...featuresWidget.keyFeatures.map(f => f?.value?.text || f?.text || f).filter(Boolean));
    } else if (featuresWidget?.features) {
        features.push(...featuresWidget.features.filter(Boolean));
    }

    // ✅ Extract "In The Box" from specs
    let inTheBox = "";
    const specs = parseSpecs(multiWidgetState);
    if (specs) {
        const generalSection = specs.find(s => s.title.toLowerCase().includes('general'));
        if (generalSection) {
            const inBoxItem = generalSection.specs.find(s => s.attribute.toLowerCase().includes('box'));
            inTheBox = inBoxItem?.value || "";
        }
    }

    // ✅ Meta fields
    const metaTitle = title || "";
    const metaDescription = description || "";
    const metaKeywords = [];

    // ✅ Build response with warnings
    const product = {
        title: (title || "").trim(),
        description: (description || "").trim(),
        inTheBox: (inTheBox || "").trim(),
        price: (price || "").trim(),
        category: (category || "").trim(),
        brand: (brand || "").trim(),
        specs,
        features,
        metaTitle: (metaTitle || "").trim(),
        metaDescription: (metaDescription || "").trim(),
        metaKeywords,
        images,
        videos
    };

    // Validation warnings
    return addWarnings(product);
}

// Gateway adapter — keeps the server's crawlX(url) naming consistent.
export async function crawlFlipkart(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("Provide a valid Flipkart product URL");
  }
  return scrapeFlipkart(url);
}