import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { requireEnv } from "./env.js";
import { HttpError } from "./errors.js";

const expectedDigest = sha256(requireEnv("API_TOKEN"));

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Expects "Authorization: Bearer <API_TOKEN>". Hashing both sides gives equal-length buffers,
// so the constant-time comparison doesn't leak the token's length or content through timing.
export const requireBearerToken: RequestHandler = (req, res, next) => {
  const match = /^Bearer (.+)$/.exec(req.get("Authorization") ?? "");
  if (!match || !timingSafeEqual(sha256(match[1]), expectedDigest)) {
    res.set("WWW-Authenticate", "Bearer");
    next(new HttpError(401, "Missing or invalid bearer token"));
    return;
  }
  next();
};
