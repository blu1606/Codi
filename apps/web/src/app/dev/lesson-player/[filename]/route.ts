import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const { filename } = await context.params;
  const contentType =
    filename === "flower.mp4"
      ? "video/mp4"
      : filename === "slides.pdf"
        ? "application/pdf"
        : null;
  if (!contentType) return new Response(null, { status: 404 });
  const file = await readFile(
    join(process.cwd(), "dev-fixtures", "lesson-player", filename),
  ).catch(() => null);
  if (!file) return new Response(null, { status: 404 });
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("range");
  if (!range)
    return new Response(file, {
      headers: { ...headers, "Content-Length": String(file.length) },
    });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1]
    ? Number(match[1])
    : Math.max(0, file.length - Number(match?.[2]));
  const end =
    match?.[1] && match[2]
      ? Math.min(Number(match[2]), file.length - 1)
      : file.length - 1;
  if (
    !match ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    start > end
  ) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${file.length}` },
    });
  }
  return new Response(file.subarray(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${file.length}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
