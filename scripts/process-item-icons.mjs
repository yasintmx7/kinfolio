/**
 * Download wiki item art → remove white / near-white backgrounds →
 * center with consistent padding → export transparent WebP (+ PNG).
 *
 * Usage: node scripts/process-item-icons.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "item-icons");
const MANIFEST_PATH = path.join(ROOT, "src", "data", "processed-item-icons.json");
const CATALOG_PATH = path.join(ROOT, "src", "data", "full-catalog.json");
const WIKI_PATH = path.join(ROOT, "src", "data", "wiki-item-images.json");

const CANVAS = 256;
const PAD_RATIO = 0.1; // 10% padding each side → content in center 80%
const WHITE_LUMA = 232; // luminance threshold for "white-ish"
const WHITE_CHROMA = 28; // max |r-g|+|g-b|+|b-r| for near-neutral
const CONCURRENCY = 6;

/** Prefer these URLs over auto wiki match (cleaner source art). */
const URL_OVERRIDES = {
  brute_horn: "https://kintara.wiki/images/4/4f/Brute_horn.png",
  molten_rock: "https://kintara.wiki/images/1/16/Molten_rock.png",
};

function slugify(id) {
  return String(id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function keysForItem(it) {
  const keys = new Set();
  const add = (v) => {
    if (!v) return;
    const s = String(v).trim();
    if (!s) return;
    keys.add(s.toLowerCase());
    keys.add(s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    keys.add(s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    keys.add(s.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  };
  add(it.id);
  add(it.slug);
  add(it.name);
  for (const a of it.aliases || []) add(a);
  // market-style snake from name
  add(it.name?.replace(/\s+/g, "_"));
  return [...keys];
}

function isNearWhite(r, g, b, a) {
  if (a < 8) return true; // already transparent-ish
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const chroma = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
  return luma >= WHITE_LUMA && chroma <= WHITE_CHROMA;
}

/** Soft alpha for near-white fringe */
function whiteAlpha(r, g, b) {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const chroma = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
  if (luma < 200 || chroma > 50) return 255;
  // map luma 200→232 soft fade, 232+ hard transparent if neutral
  if (luma >= WHITE_LUMA && chroma <= WHITE_CHROMA) return 0;
  if (luma >= 220 && chroma <= 40) {
    return Math.round(255 * ((WHITE_LUMA - luma) / (WHITE_LUMA - 220)));
  }
  if (luma >= 200 && chroma <= 50) {
    const t = (luma - 200) / 32;
    return Math.round(255 * (1 - t * 0.55));
  }
  return 255;
}

/**
 * Flood-fill near-white from edges (true background), then soft-key remaining whites.
 */
function removeWhiteBackground(raw, width, height) {
  const data = Buffer.from(raw);
  const n = width * height;
  const bg = new Uint8Array(n); // 1 = background
  const stack = [];

  const idx = (x, y) => y * width + x;
  const pushIfBg = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = idx(x, y);
    if (bg[i]) return;
    const o = i * 4;
    if (isNearWhite(data[o], data[o + 1], data[o + 2], data[o + 3])) {
      bg[i] = 1;
      stack.push(i);
    }
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    if (bg[i]) {
      data[o + 3] = 0;
      continue;
    }
    // soft de-white for fringe / residual plate
    const wa = whiteAlpha(r, g, b);
    data[o + 3] = Math.min(a, wa);
  }

  return data;
}

function contentBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function processBuffer(inputBuf) {
  const base = sharp(inputBuf, { failOn: "none" }).ensureAlpha().rotate();
  const { data, info } = await base
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cleaned = removeWhiteBackground(data, info.width, info.height);
  const bounds = contentBounds(cleaned, info.width, info.height);

  let pipeline = sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });

  if (bounds) {
    pipeline = pipeline.extract(bounds);
  }

  const inner = Math.round(CANVAS * (1 - PAD_RATIO * 2));
  const fitted = await pipeline
    .resize(inner, inner, {
      fit: "inside",
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  // Center on transparent canvas
  const left = Math.floor((CANVAS - fitted.info.width) / 2);
  const top = Math.floor((CANVAS - fitted.info.height) / 2);

  const webp = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fitted.data, raw: { width: fitted.info.width, height: fitted.info.height, channels: 4 }, left, top }])
    .webp({ quality: 88, alphaQuality: 100, effort: 4 })
    .toBuffer();

  const png = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fitted.data, raw: { width: fitted.info.width, height: fitted.info.height, channels: 4 }, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { webp, png };
}

async function fetchImage(url) {
  const res = await fetch(url, {
    headers: { Accept: "image/*", "User-Agent": "KinfolioIconProcessor/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const cur = i++;
      out[cur] = await fn(items[cur], cur);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  const wiki = JSON.parse(await fs.readFile(WIKI_PATH, "utf8"));

  /** @type {Map<string, { id: string, keys: string[], url: string }>} */
  const jobs = new Map();

  for (const it of catalog.items || []) {
    const id = slugify(it.id || it.slug || it.name);
    if (!id) continue;
    const override =
      URL_OVERRIDES[id.replace(/-/g, "_")] ||
      URL_OVERRIDES[id.replace(/-/g, "")] ||
      null;
    const url =
      override ||
      it.imageUrl ||
      wiki.urlByKey?.[id] ||
      wiki.urlByKey?.[id.replace(/-/g, "_")] ||
      wiki.urlByKey?.[id.replace(/-/g, "")];
    if (!url) continue;
    if (!jobs.has(id)) {
      jobs.set(id, { id, keys: keysForItem(it), url });
    } else {
      const j = jobs.get(id);
      j.keys = [...new Set([...j.keys, ...keysForItem(it)])];
    }
  }

  // Market types from item-type-map favorites / common resources
  const extra = [
    ["wood", "wood"],
    ["stone", "stone"],
    ["coal", "coal"],
    ["metal", "metal"],
    ["gold", "gold"],
    ["brute_horn", "brute_horn"],
    ["molten_rock", "molten_rock"],
    ["cooked_fish_meat", "cooked_fish_meat"],
  ];
  for (const [id, wikiKey] of extra) {
    const slug = slugify(id);
    if (jobs.has(slug)) continue;
    const url =
      URL_OVERRIDES[id] ||
      wiki.urlByKey?.[wikiKey] ||
      wiki.urlByKey?.[`${wikiKey}.png`];
    if (!url) continue;
    jobs.set(slug, {
      id: slug,
      keys: keysForItem({ id, name: id, aliases: [wikiKey] }),
      url,
    });
  }

  const list = [...jobs.values()];
  console.log(`Processing ${list.length} icons → ${OUT_DIR}`);

  const urlByKey = {};
  let ok = 0;
  let fail = 0;

  await mapPool(list, CONCURRENCY, async (job) => {
    try {
      const buf = await fetchImage(job.url);
      const { webp, png } = await processBuffer(buf);
      const webpName = `${job.id}.webp`;
      const pngName = `${job.id}.png`;
      await fs.writeFile(path.join(OUT_DIR, webpName), webp);
      await fs.writeFile(path.join(OUT_DIR, pngName), png);
      const local = `/item-icons/${webpName}`;
      for (const k of job.keys) {
        urlByKey[k] = local;
      }
      urlByKey[job.id] = local;
      ok++;
      process.stdout.write(`✓ ${job.id}\n`);
    } catch (e) {
      fail++;
      process.stdout.write(`✗ ${job.id}: ${e.message}\n`);
    }
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    canvas: CANVAS,
    padRatio: PAD_RATIO,
    format: "webp",
    count: ok,
    failed: fail,
    source: "kintara.wiki (processed transparent)",
    urlByKey,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 0), "utf8");
  console.log(`\nDone: ${ok} ok, ${fail} failed. Manifest → ${MANIFEST_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
