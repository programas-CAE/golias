import { randomBytes } from "node:crypto";

/** Gera um token de link público seguro (aleatório, ao contrário de cuid()). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
