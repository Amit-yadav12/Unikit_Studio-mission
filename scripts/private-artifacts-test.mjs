import assert from "node:assert/strict";
import sharp from "sharp";
const base = process.argv[2] || "http://localhost:3000";
let cookie = "";
let checks = 0;
const check = (x, m) => {
  assert.ok(x, m);
  console.log(`✓ ${m}`);
  checks++;
};
async function get(path, init = {}) {
  const r = await fetch(base + path, {
    ...init,
    headers: { cookie, ...init.headers },
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return r;
}
function body(bytes, name, type, params) {
  const f = new FormData();
  f.append("files", new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(params)) f.append(k, v);
  return f;
}
const before = (await (await get("/api/v1/history")).json()).data.total;
const bmp = await sharp({
  create: { width: 16, height: 12, channels: 3, background: "#6540a5" },
})
  .tiff({ compression: "lzw" })
  .toBuffer();
const t = await get("/api/v1/images/optimize", {
  method: "POST",
  body: body(bmp, "input.tif", "image/tiff", {
    delivery: "temporary",
    format: "webp",
  }),
});
check(
  t.ok && t.headers.get("content-type") === "image/webp",
  "temporary TIFF input produces WebP",
);
const bytes = Buffer.from(await t.arrayBuffer());
const receipt = JSON.parse(
  decodeURIComponent(t.headers.get("x-unikit-result")),
);
check(
  bytes.length === receipt.outputBytes &&
    receipt.savedBytes === bmp.length - bytes.length,
  "temporary binary length matches the receipt",
);
check(
  (await sharp(bytes).metadata()).format === "webp",
  "temporary output decodes",
);
check(
  (await (await get("/api/v1/history")).json()).data.total === before,
  "temporary conversion creates no stored job/artifact",
);
const tiny = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const response = await get("/api/v1/images/optimize", {
  method: "POST",
  body: body(tiny, "tiny.gif", "image/gif", {
    policy: "no-regression",
    format: "webp",
  }),
});
const j = (await response.json()).data;
check(
  j.results[0].retainedOriginal &&
    j.results[0].outputBytes === tiny.length &&
    j.results[0].savedBytes === 0,
  "no-regression fixture retains exact original size",
);
check(
  j.results[0].artifactAvailable === false,
  "retained original has no download reference",
);
const detail = await (await get("/api/v1/history/" + j.jobId)).json();
check(
  detail.data.items[0].hasArtifact === false,
  "persisted history also has no source artifact",
);
const a = await get("/api/v1/images/optimize", {
  method: "POST",
  body: body(tiny, "tiny.gif", "image/gif", {
    delivery: "temporary",
    format: "tiff",
  }),
});
const z = JSON.parse(decodeURIComponent(a.headers.get("x-unikit-result")));
check(
  z.outputBytes > z.inputBytes &&
    z.savingsPercent < 0 &&
    z.savedBytes === z.inputBytes - z.outputBytes,
  "larger TIFF output is honestly reported as negative savings",
);
const unchanged = await get("/api/v1/css/patch-font-display", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ css: ".rule{color:indigo}", policy: "swap" }),
});
const uj = (await unchanged.json()).data;
check(
  uj.artifactId === null && uj.output === ".rule{color:indigo}",
  "unchanged source CSS is returned but not archived",
);
console.log(`${checks} privacy and byte-integrity checks passed.`);
