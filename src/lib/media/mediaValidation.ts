export type MediaKind = "IMAGE" | "VIDEO" | "FILE";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function mediaTypeFromContentType(contentType: string): MediaKind {
  if (IMAGE_TYPES.has(contentType)) return "IMAGE";
  if (VIDEO_TYPES.has(contentType)) return "VIDEO";
  return "FILE";
}

export function validateMediaUpload(contentType: string, sizeBytes: number): { ok: true; mediaType: MediaKind } | { ok: false; error: string } {
  const mediaType = mediaTypeFromContentType(contentType);

  if (mediaType === "FILE") {
    return { ok: false, error: "Unsupported media type. Upload an image or video." };
  }

  const maxImageBytes = envInt("FIREBASE_UPLOAD_MAX_IMAGE_MB", 5) * 1024 * 1024;
  const maxVideoBytes = envInt("FIREBASE_UPLOAD_MAX_VIDEO_MB", 50) * 1024 * 1024;
  const maxBytes = mediaType === "IMAGE" ? maxImageBytes : maxVideoBytes;

  if (sizeBytes > maxBytes) {
    return { ok: false, error: `${mediaType === "IMAGE" ? "Image" : "Video"} is too large.` };
  }

  return { ok: true, mediaType };
}
