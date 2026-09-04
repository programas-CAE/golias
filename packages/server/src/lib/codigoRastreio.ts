import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * AAAAMMDD (do dia em que o RDO está sendo criado agora, não o dia do
 * campo) + sequência de 3 dígitos entre os RDOs criados nesse mesmo dia —
 * só pra facilitar busca ("me manda o RDO 20260830003"), sem significado
 * de negócio.
 */
async function proximoCodigoRastreio(): Promise<string> {
  const agora = new Date();
  const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fimDoDia = new Date(inicioDoDia.getTime() + 24 * 60 * 60 * 1000);
  const prefixo = `${inicioDoDia.getFullYear()}${String(inicioDoDia.getMonth() + 1).padStart(2, "0")}${String(inicioDoDia.getDate()).padStart(2, "0")}`;
  const contagem = await prisma.rdo.count({ where: { criadoEm: { gte: inicioDoDia, lt: fimDoDia } } });
  return `${prefixo}${String(contagem + 1).padStart(3, "0")}`;
}

/**
 * Tenta criar com um código de rastreio novo; se colidir (duas criações
 * na mesma janela contaram o mesmo número antes de qualquer uma commitar),
 * tenta de novo com o próximo número — até 3 vezes, o suficiente pra
 * qualquer corrida realista nesse app.
 */
export async function comCodigoRastreio<T>(criar: (codigo: string) => Promise<T>): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const codigo = await proximoCodigoRastreio();
    try {
      return await criar(codigo);
    } catch (error) {
      // `error.meta.target` era o jeito de achar o campo colidido nas
      // versões antigas do Prisma Client — com os driver adapters (Prisma
      // 7), o P2002 chega sem `target`, só com o detalhe dentro de
      // `meta.driverAdapterError`. Checar a mensagem em vez do formato
      // interno do meta é mais robusto: ela sempre cita o nome do campo,
      // independente da versão/adapter (bug real visto em produção — a
      // colisão nunca era detectada, então nunca tentava de novo).
      const ehColisaoDeCodigo =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && error.message.includes("codigoRastreio");
      if (!ehColisaoDeCodigo || tentativa >= 2) throw error;
    }
  }
}
