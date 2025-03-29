declare module ".prisma/client" {
  import { PrismaClient as OriginalPrismaClient } from "@prisma/client";
  export * from "@prisma/client";
  export { OriginalPrismaClient as PrismaClient };
}
