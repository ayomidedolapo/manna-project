import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getStorage, type Storage } from "firebase-admin/storage";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function normalizePrivateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
}

function parseServiceAccountFromBase64(): ServiceAccountJson | null {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as ServiceAccountJson;
  } catch {
    return null;
  }
}

function getFirebaseCredentials(): ServiceAccountJson | null {
  const fromBase64 = parseServiceAccountFromBase64();
  if (fromBase64?.project_id && fromBase64.client_email && fromBase64.private_key) {
    return fromBase64;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(getFirebaseCredentials()?.project_id && process.env.FIREBASE_STORAGE_BUCKET);
}

export function getFirebaseAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const credentials = getFirebaseCredentials();
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!credentials?.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.");
  }

  if (!storageBucket) {
    throw new Error("FIREBASE_STORAGE_BUCKET is required for Firebase Storage uploads.");
  }

  return initializeApp({
    credential: cert({
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key,
    }),
    storageBucket,
  });
}

export function getFirebaseMessagingClient(): Messaging {
  return getMessaging(getFirebaseAdminApp());
}

export function getFirebaseStorageClient(): Storage {
  return getStorage(getFirebaseAdminApp());
}

export function getFirebaseStorageBucket() {
  return getFirebaseStorageClient().bucket(process.env.FIREBASE_STORAGE_BUCKET);
}
