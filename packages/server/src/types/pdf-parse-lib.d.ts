/// <reference types="node" />

// `@types/pdf-parse` só declara o módulo "pdf-parse" (o index.js, que tem o
// bug de auto-teste em projetos ESM — ver comentário em omPdfParser.ts).
// Usamos o "lib/pdf-parse.js" interno em vez disso, então precisa da própria
// declaração — mesmo shape do pacote de tipos oficial.
declare module "pdf-parse/lib/pdf-parse.js" {
  function PdfParse(dataBuffer: Buffer, options?: PdfParse.Options): Promise<PdfParse.Result>;

  namespace PdfParse {
    interface Result {
      numpages: number;
      numrender: number;
      info: unknown;
      metadata: unknown;
      version: string;
      text: string;
    }
    interface Options {
      pagerender?: ((pageData: unknown) => string | Promise<string>) | undefined;
      max?: number | undefined;
      version?: string | undefined;
    }
  }

  export = PdfParse;
}
