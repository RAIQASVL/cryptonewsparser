/*
  Warnings:

  - Added the required column `channelId` to the `ForwardPost` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ForwardPost" ADD COLUMN     "channelId" TEXT NOT NULL;
