-- CreateEnum
CREATE TYPE "Templates" AS ENUM ('REACT', 'NEXTJS', 'EXPRESS', 'HONO', 'ANGULAR', 'VUE');

-- CreateTable
CREATE TABLE "Playground" (
    "_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "describtion" TEXT,
    "template" "Templates" NOT NULL DEFAULT 'REACT',
    "userId" TEXT NOT NULL,

    CONSTRAINT "Playground_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "StartMark" (
    "_id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isMarked" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playgroundId" TEXT NOT NULL,

    CONSTRAINT "StartMark_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StartMark_userId_playgroundId_key" ON "StartMark"("userId", "playgroundId");

-- AddForeignKey
ALTER TABLE "StartMark" ADD CONSTRAINT "StartMark_playgroundId_fkey" FOREIGN KEY ("playgroundId") REFERENCES "Playground"("_id") ON DELETE CASCADE ON UPDATE CASCADE;
