-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "validation" BOOLEAN NOT NULL,
    "newPost" TEXT,
    "imagePrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardPost" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "forwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForwardPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardPost_channel_messageId_key" ON "ForwardPost"("channel", "messageId");
