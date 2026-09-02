import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { generateToken } from "./tokens.js";
import { prisma } from "./prisma.js";
import { requireEnv } from "./loadEnv.js";

/**
 * Login de fiscal/encarregado (e futuramente escritório) — substitui os
 * links públicos por frente. Par access/refresh token, igual ao desenho já
 * previsto no schema (`Usuario`/`SessaoRefreshToken`) mas nunca
 * implementado — ver JWT_ACCESS_SECRET/JWT_REFRESH_SECRET em .env.example.
 *
 * Access token: JWT de vida curta (8h — dá pro turno inteiro sem precisar
 * logar de novo), nunca gravado no banco (verificação é só criptográfica).
 * Refresh token: JWT de vida longa (30 dias), mas TAMBÉM gravado (só o
 * hash) em SessaoRefreshToken — permite revogar (logout) mesmo sendo um
 * JWT, e serve pra emitir um access token novo sem pedir senha de novo.
 */

const ACCESS_TOKEN_DURACAO = "8h";
const REFRESH_TOKEN_DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const REFRESH_TOKEN_DURACAO_JWT = "30d";

export interface AccessTokenPayload {
  sub: string;
  role: string;
  frenteId: string | null;
  colaboradorId: string | null;
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

function segredoAccess(): Uint8Array {
  return new TextEncoder().encode(requireEnv("JWT_ACCESS_SECRET"));
}

function segredoRefresh(): Uint8Array {
  return new TextEncoder().encode(requireEnv("JWT_REFRESH_SECRET"));
}

export async function assinarAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_DURACAO)
    .sign(segredoAccess());
}

/** Retorna null se o token for inválido/expirado, em vez de lançar — quem chama decide o 401. */
export async function verificarAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, segredoAccess());
    return payload as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Emite um refresh token novo pro usuário, gravando a sessão (revogável) no banco. */
export async function criarSessao(usuarioId: string, ip: string | null): Promise<string> {
  const token = await new SignJWT({ sub: usuarioId, jti: generateToken() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_DURACAO_JWT)
    .sign(segredoRefresh());

  await prisma.sessaoRefreshToken.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      expiraEm: new Date(Date.now() + REFRESH_TOKEN_DURACAO_MS),
      criadoIp: ip,
    },
  });

  return token;
}

/** Verifica um refresh token e devolve o usuarioId — null se inválido, expirado ou revogado. */
export async function verificarSessao(token: string): Promise<string | null> {
  let usuarioId: string;
  try {
    const { payload } = await jwtVerify(token, segredoRefresh());
    if (typeof payload.sub !== "string") return null;
    usuarioId = payload.sub;
  } catch {
    return null;
  }

  const sessao = await prisma.sessaoRefreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!sessao || sessao.revogadoEm != null || sessao.expiraEm.getTime() < Date.now()) {
    return null;
  }
  return usuarioId;
}

export async function revogarSessao(token: string): Promise<void> {
  await prisma.sessaoRefreshToken
    .updateMany({ where: { tokenHash: hashToken(token) }, data: { revogadoEm: new Date() } })
    .catch(() => {
      // token inválido/já revogado — logout é idempotente, não precisa dar erro
    });
}
