import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";

type PushPayload = {
  title: string;
  body: string;
  actionUrl?: string | null;
  imageUrl?: string | null;
  data?: Record<string, string>;
};

function getServiceAccount(): ServiceAccount | null {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (encoded) {
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(raw) as ServiceAccount;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) ||
    Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function ensureFirebaseApp(): void {
  if (getApps().length > 0) {
    return;
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.");
  }

  initializeApp({
    credential: cert(serviceAccount),
  });
}

export async function sendFirebasePush(tokens: string[], payload: PushPayload) {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] as string[] };
  }

  ensureFirebaseApp();

  const message: MulticastMessage = {
    tokens: uniqueTokens,
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl ?? undefined,
    },
    data: {
      actionUrl: payload.actionUrl ?? "",
      ...(payload.data ?? {}),
    },
    webpush: {
      fcmOptions: {
        link: payload.actionUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? undefined,
      },
    },
  };

  const response = await getMessaging().sendEachForMulticast(message);
  const invalidTokens: string[] = [];

  response.responses.forEach((item, index) => {
    const code = item.error?.code;
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      invalidTokens.push(uniqueTokens[index]);
    }
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  };
}
