import { z } from "zod";
import { route, jsonOk, parseJson } from "@/server/http/handler";
import { persistJob } from "@/server/services/storageService";
import { limits } from "@/server/config/env";
import { storageUnavailable } from "@/server/http/errors";

/** A metadata-only receipt, never a file-upload endpoint. Client measurements are labelled. */
const bytes = z
  .number()
  .int()
  .min(0)
  .max(128 * 1024 * 1024);
const dim = z.number().int().min(1).max(65535).nullable();
const receipt = z
  .object({
    kind: z
      .enum(["image.optimize", "css.font-display", "asset.analyze"])
      .default("image.optimize"),
    engine: z.enum(["device", "extended"]),
    items: z
      .array(
        z
          .object({
            filename: z.string().min(1).max(120),
            outputFilename: z.string().max(150),
            status: z.enum(["completed", "failed"]),
            inputBytes: bytes,
            outputBytes: bytes,
            inputWidth: dim,
            inputHeight: dim,
            outputWidth: dim,
            outputHeight: dim,
            outputFormat: z.enum([
              "jpeg",
              "png",
              "webp",
              "avif",
              "gif",
              "tiff",
              "bmp",
              "svg",
              "ico",
              "heic",
              "css",
              "other",
              "—",
            ]),
            retainedOriginal: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(limits.maxFilesPerRequest),
  })
  .strict();
export const runtime = "nodejs";
export const POST = route(
  async (req, ctx) => {
    const data = await parseJson(req, receipt);
    const done = data.items.filter((i) => i.status === "completed");
    const input = done.reduce((a, b) => a + b.inputBytes, 0),
      out = done.reduce((a, b) => a + b.outputBytes, 0);
    const record = await persistJob({
      sessionId: ctx.sessionId,
      kind: data.kind,
      status: !done.length
        ? "failed"
        : done.length === data.items.length
          ? "completed"
          : "partial",
      label:
        data.kind === "css.font-display"
          ? "CSS font-display review"
          : data.kind === "asset.analyze"
            ? `${data.items.length} assets inspected`
            : `${done.length} image${done.length === 1 ? "" : "s"} · ${data.engine === "device" ? "On-device" : "Extended codecs"}`,
      fileCount: data.items.length,
      inputBytes: input,
      outputBytes: out,
      savedBytes: data.kind === "image.optimize" ? input - out : 0,
      note: "Device-reported measurements · Downloads remain in the originating tab",
      items: data.items.map((i) => ({
        ...i,
        savedBytes:
          data.kind === "image.optimize" && i.status === "completed"
            ? i.inputBytes - i.outputBytes
            : 0,
        savingsPercent:
          data.kind === "image.optimize" &&
          i.status === "completed" &&
          i.inputBytes
            ? ((i.inputBytes - i.outputBytes) / i.inputBytes) * 100
            : null,
        artifact: null,
        message:
          i.status === "failed"
            ? "Not converted"
            : "Tab-local result; no file stored",
      })),
    });
    if (!record.persisted)
      throw storageUnavailable(
        "Your files are ready, but history could not be saved.",
      );
    return jsonOk({ jobId: record.jobId }, ctx);
  },
  { bucket: "history" },
);
