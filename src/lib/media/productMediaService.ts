import { prisma } from "@/lib/prisma";
import { deleteFromFirebaseStorage, uploadToFirebaseStorage } from "@/lib/media/firebaseStorage";
import { validateMediaUpload } from "@/lib/media/mediaValidation";

type ProductForVendor = {
  id: string;
  vendorId: string | null;
};

type VendorUserAccess = {
  id: string;
};

export async function assertVendorCanManageProduct(userId: string, productId: string): Promise<ProductForVendor> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, vendorId: true },
  }) as ProductForVendor | null;

  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  if (!product.vendorId) {
    throw new Error("PRODUCT_HAS_NO_VENDOR");
  }

  const vendorUser = await prisma.vendorUser.findFirst({
    where: {
      userId,
      vendorId: product.vendorId,
      isActive: true,
    },
    select: { id: true },
  }) as VendorUserAccess | null;

  if (!vendorUser) {
    throw new Error("VENDOR_ACCESS_DENIED");
  }

  return product;
}

export async function uploadProductMedia(input: {
  userId: string;
  productId: string;
  file: File;
  purpose?: string;
}) {
  const product = await assertVendorCanManageProduct(input.userId, input.productId);
  const arrayBuffer = await input.file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const validation = validateMediaUpload(input.file.type, buffer.byteLength);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const upload = await uploadToFirebaseStorage({
    buffer,
    contentType: input.file.type,
    originalFilename: input.file.name,
    mediaType: validation.mediaType,
    ownerType: "PRODUCT",
    ownerId: input.productId,
    productId: input.productId,
    vendorId: product.vendorId,
    purpose: input.purpose || "product-media",
  });

  return prisma.mediaAsset.create({
    data: {
      storageProvider: "FIREBASE_STORAGE",
      bucket: upload.bucket,
      storagePath: upload.storagePath,
      downloadToken: upload.downloadToken,
      publicUrl: upload.publicUrl,
      mediaType: validation.mediaType,
      purpose: input.purpose || "PRODUCT_MEDIA",
      contentType: input.file.type,
      originalFilename: input.file.name,
      sizeBytes: buffer.byteLength,
      ownerType: "PRODUCT",
      ownerId: input.productId,
      productId: input.productId,
      vendorId: product.vendorId,
      uploadedByUserId: input.userId,
      approvalStatus: "PENDING_REVIEW",
      metadata: {
        provider: "firebase_storage",
      },
    } as never,
  });
}

export async function deleteVendorProductMedia(input: {
  userId: string;
  productId: string;
  mediaId: string;
}) {
  await assertVendorCanManageProduct(input.userId, input.productId);

  const media = await prisma.mediaAsset.findFirst({
    where: {
      id: input.mediaId,
      productId: input.productId,
      approvalStatus: { not: "DELETED" },
    },
  }) as { id: string; storagePath: string } | null;

  if (!media) {
    throw new Error("MEDIA_NOT_FOUND");
  }

  await deleteFromFirebaseStorage(media.storagePath);

  return prisma.mediaAsset.update({
    where: { id: media.id },
    data: {
      approvalStatus: "DELETED",
      deletedAt: new Date(),
    } as never,
  });
}
