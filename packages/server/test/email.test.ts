import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarEmail } from "../src/lib/email.js";

describe("enviarEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("não quebra e só avisa no log quando o SMTP não está configurado", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(enviarEmail({ para: "fiscal@example.com", assunto: "Teste", texto: "Corpo" })).resolves.toBeUndefined();

    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("fiscal@example.com"));
  });
});
