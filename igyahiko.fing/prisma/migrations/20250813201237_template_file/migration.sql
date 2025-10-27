-- CreateTable
CREATE TABLE "TemplateFile" (
    "_id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playgroundId" TEXT NOT NULL,

    CONSTRAINT "TemplateFile_pkey" PRIMARY KEY ("_id")
);

-- AddForeignKey
ALTER TABLE "TemplateFile" ADD CONSTRAINT "TemplateFile_playgroundId_fkey" FOREIGN KEY ("playgroundId") REFERENCES "Playground"("_id") ON DELETE CASCADE ON UPDATE CASCADE;
