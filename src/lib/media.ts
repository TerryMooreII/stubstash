// Photos, ticket stubs and avatars in Supabase Storage.
// Files live under "<user_id>/..." (the storage policies check that folder).

import { supabase } from "./supabase";

export type Bucket = "photos" | "stubs" | "avatars";

/**
 * Shrinks an image in the browser before upload (max edge, JPEG/WebP).
 * Phones produce 4-12 MB photos; this keeps uploads quick on venue Wi-Fi.
 */
export async function compressImage(file: File, maxEdge = 1800, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/") || /heic|heif/i.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  return blob && blob.size < file.size ? blob : file;
}

async function myId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in.");
  return data.user.id;
}

/** Uploads a file and returns its storage path. */
export async function upload(bucket: Bucket, file: File, folder: string, opts: { maxEdge?: number } = {}): Promise<string> {
  const uid = await myId();
  const blob = await compressImage(file, opts.maxEdge);
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || file.type, cacheControl: "31536000", upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeFile(bucket: Bucket, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

const signedCache = new Map<string, { url: string; exp: number }>();

/** Signed URL for a private photo/stub (cached for most of its lifetime). */
export async function signedUrl(bucket: "photos" | "stubs", path: string, expiresIn = 3600): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = signedCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  signedCache.set(key, { url: data.signedUrl, exp: Date.now() + (expiresIn - 120) * 1000 });
  return data.signedUrl;
}

export async function signedUrls(bucket: "photos" | "stubs", paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing = paths.filter((p) => {
    const hit = signedCache.get(`${bucket}/${p}`);
    if (hit && hit.exp > Date.now()) { out[p] = hit.url; return false; }
    return true;
  });
  if (missing.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, 3600);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) {
        out[row.path] = row.signedUrl;
        signedCache.set(`${bucket}/${row.path}`, { url: row.signedUrl, exp: Date.now() + 3480_000 });
      }
    }
  }
  return out;
}

/** Public URL for an avatar path, or null. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

/** Adds a photo to an attendance. */
export async function addShowPhoto(attendanceId: string, file: File) {
  const path = await upload("photos", file, attendanceId);
  const uid = await myId();
  const { data, error } = await supabase.from("attendance_photos")
    .insert({ attendance_id: attendanceId, user_id: uid, storage_path: path })
    .select("id, storage_path, created_at").single();
  if (error) {
    await removeFile("photos", path).catch(() => {});
    throw error;
  }
  return data;
}

export async function deleteShowPhoto(id: string, path: string) {
  const { error } = await supabase.from("attendance_photos").delete().eq("id", id);
  if (error) throw error;
  await removeFile("photos", path).catch(() => {});
}
