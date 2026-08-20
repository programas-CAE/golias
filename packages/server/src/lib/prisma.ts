import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireEnv } from "./loadEnv.js";

const adapter = new PrismaPg(requireEnv("DATABASE_URL"));

export const prisma = new PrismaClient({ adapter });
