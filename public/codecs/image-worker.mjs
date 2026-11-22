/* Unikit Studio — single-file, tab-local worker. No user bytes leave this worker. */
let encoder;
async function encode(canvas, format, quality) {
  if (format === "avif") {
    const [{ default: factory }, { defaultOptions }] = await Promise.all([
      import("./avif-2.1.1/avif_enc.js"),
      import("./avif-2.1.1/meta.js"),
    ]);
    encoder ??= await factory({ noInitialRun: true });
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height);
    const encoded = encoder.encode(
      new Uint8Array(data.data.buffer),
      canvas.width,
      canvas.height,
      { ...defaultOptions, quality, speed: 8 },
    );
    if (!encoded?.length)
      throw new Error(
        "The AVIF encoder could not finish. Try WebP or a smaller width.",
      );
    return new Blob([new Uint8Array(encoded)], { type: "image/avif" });
  }
  const type = "image/" + format;
  const out = await canvas.convertToBlob({ type, quality: quality / 100 });
  if (out.type !== type || !out.size)
    throw new Error(
      `This browser cannot encode ${format.toUpperCase()}. Choose a different output or Extended codecs.`,
    );
  return out;
}
self.onmessage = async ({ data: { file, header, settings, maxPixels } }) => {
  let bitmap, canvas;
  try {
    if (
      typeof OffscreenCanvas === "undefined" ||
      typeof createImageBitmap !== "function"
    )
      throw new Error(
        "On-device encoding is unavailable here. Choose Extended codecs to use the temporary server encoder.",
      );
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const iw = bitmap.width,
      ih = bitmap.height;
    if (!iw || !ih || iw * ih > maxPixels)
      throw new Error("The decoded image exceeds the pixel budget.");
    const scale = Math.min(
      1,
      settings.maxWidth ? settings.maxWidth / iw : 1,
      settings.maxHeight ? settings.maxHeight / ih : 1,
    );
    const width = Math.max(1, Math.round(iw * scale)),
      height = Math.max(1, Math.round(ih * scale));
    canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      throw new Error(
        "Could not allocate a drawing surface. Try a smaller image.",
      );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    bitmap = null;
    const native = ["png", "jpeg", "webp", "avif"];
    const preferred =
      settings.format === "original"
        ? native.includes(header.format)
          ? header.format
          : "png"
        : settings.format;
    const multi = settings.policy !== "single";
    const formats = multi
      ? [
          "webp",
          ...(width * height <= 4_000_000 ? ["avif"] : []),
          ...(header.hasAlpha === false ? ["jpeg"] : ["png"]),
        ]
      : [preferred];
    const candidates = [];
    let winner = null,
      winnerFmt = "",
      bestIndex = -1;
    for (const format of [...new Set(formats)]) {
      try {
        if (format === "avif" && width * height > 8_000_000)
          throw new Error(
            "For local AVIF, cap the output at 8 MP or choose Extended codecs.",
          );
        if (format === "jpeg" && header.hasAlpha !== false) {
          const bytes = ctx.getImageData(0, 0, width, height).data;
          for (let i = 3; i < bytes.length; i += 4)
            if (bytes[i] !== 255)
              throw new Error(
                "JPEG cannot retain transparent pixels. Choose WebP, AVIF or PNG.",
              );
        }
        const blob = await encode(canvas, format, settings.quality);
        candidates.push({
          format,
          quality: format === "png" ? 100 : settings.quality,
          bytes: blob.size,
          selected: false,
          note: format === "png" ? "Lossless output" : "On-device encoder",
        });
        if (!winner || blob.size < winner.size) {
          winner = blob;
          winnerFmt = format;
          bestIndex = candidates.length - 1;
        }
      } catch (error) {
        if (!multi) throw error;
      }
    }
    if (!winner)
      throw new Error(
        "No supported encoder completed. Try Extended codecs or a smaller output.",
      );
    const retained =
      settings.policy === "no-regression" &&
      scale === 1 &&
      winner.size >= file.size;
    if (retained)
      candidates.push({
        format: header.format,
        quality: 100,
        bytes: file.size,
        selected: true,
        note: "Original retained",
      });
    else candidates[bestIndex].selected = true;
    self.postMessage({
      ok: true,
      blob: retained ? file : winner,
      format: retained ? header.format : winnerFmt,
      retained,
      candidates,
      iw,
      ih,
      width: retained ? iw : width,
      height: retained ? ih : height,
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The file could not be decoded.",
    });
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};
