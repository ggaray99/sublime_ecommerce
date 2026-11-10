import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { statMediaFile } from "@/server/media/disk";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

const notFound = () => new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Public photos uploaded from /admin. Only the public area of the media disk is
 * reachable here, only image types are served, and file names are random and
 * never reused, so responses can be cached for a year.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...path]">) {
  const { path } = await params;
  const pathname = path.join("/");
  const type = TYPES[pathname.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) return notFound();
  const file = await statMediaFile("public", pathname);
  if (!file) return notFound();
  return new Response(Readable.toWeb(createReadStream(file.path)) as ReadableStream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
