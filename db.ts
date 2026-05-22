import { PrismaClient } from '@prisma/client';

// Add a global check to prevent multiple PrismaClient instances in development
// This is a common pattern to avoid issues with hot-reloading
// where the module might be re-imported multiple times.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL || "file:./dev.db",
    log: ['query', 'error', 'warn'], // Optional: configure logging levels
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}