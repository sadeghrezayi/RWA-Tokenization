-- CreateTable
CREATE TABLE "crm_profiles" (
    "investor_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "tags" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_profiles_pkey" PRIMARY KEY ("investor_id")
);

-- CreateTable
CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_follow_ups" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_follow_ups_pkey" PRIMARY KEY ("id")
);
