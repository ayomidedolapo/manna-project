import { randomUUID } from "crypto";
import path from "path";
import { getFirebaseStorageBucket } from "@/lib/firebase/admin";

export type FirebaseMediaType = "IMAGE" | "VIDEO" | "FILE";

export type FirebaseUploadInput = {
  buffer: Buffer;
  contentType: string;
  originalFilename?: string;
  mediaType: FirebaseMediaType;
  ownerType: string;
  ownerId: string;
  productId?: string | null;
  vendorId?: string | null;
  purpose?: string;
};

export type FirebaseUploadResult = {
  bucket: string;
  storagePath: string;
  downloadToken: string;
  publicUrl: string;
};

const SAFE_FILENAME_REGEX = /[^a-zA-Z0-9._-]/g;

function sanitizeFilename(filename: string | undefined): string {
  const fallback = "upload";
  const parsed = path.basename(filename || fallback).replace(SAFE_FILENAME_REGEX, "-");
  return parsed || fallback;
}

function folderFor(input: FirebaseUploadInput): string {
  const root = process.env.FIREBASE_MEDIA_ROOT_FOLDER || "manna";
  const purpose = (input.purpose || "general").toLowerCase().replace(SAFE_FILENAME_REGEX, "-");

  if (input.ownerType === "PRODUCT" && input.productId) {
    return `${root}/products/${input.productId}/${purpose}`;
  }

  if (input.vendorId) {
    return `${root}/vendors/${input.vendorId}/${input.ownerType.toLowerCase()}/${input.ownerId}/${purpose}`;
  }

  return `${root}/${input.ownerType.toLowerCase()}/${input.ownerId}/${purpose}`;
}

function buildDownloadUrl(bucketName: string, storagePath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

export async function uploadToFirebaseStorage(input: FirebaseUploadInput): Promise<FirebaseUploadResult> {
  const bucket = getFirebaseStorageBucket();
  const downloadToken = randomUUID();
  const filename = sanitizeFilename(input.originalFilename);
  const storagePath = `${folderFor(input)}/${Date.now()}-${randomUUID()}-${filename}`;
  const file = bucket.file(storagePath);

  await file.save(input.buffer, {
    resumable: false,
    metadata: {
      contentType: input.contentType,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  return {
    bucket: bucket.name,
    storagePath,
    downloadToken,
    publicUrl: buildDownloadUrl(bucket.name, storagePath, downloadToken),
  };
}

export async function deleteFromFirebaseStorage(storagePath: string): Promise<void> {
  const bucket = getFirebaseStorageBucket();
  await bucket.file(storagePath).delete({ ignoreNotFound: true });
}
