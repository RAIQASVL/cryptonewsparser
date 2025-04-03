declare namespace PrismaClient {
  export type PrismaClient = import("@prisma/client").PrismaClient;
}

declare module "@prisma/client" {
  export const PrismaClient: any;
  export * from ".prisma/client";
}
