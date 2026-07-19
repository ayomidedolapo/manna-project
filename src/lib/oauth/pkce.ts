import { createHash } from "node:crypto";

export function createPkceChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
