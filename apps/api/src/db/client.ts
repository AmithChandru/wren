import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in development. Without this guard
// `tsx watch` (and similar) would instantiate a new client on every reload and
// eventually exhaust the database connection pool. In production a single instance
// is created once per process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
