-- Add username for login; keep email optional for contact/recovery.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;

UPDATE "User"
SET "username" = lower(
  regexp_replace(
    split_part(COALESCE(email, id), '@', 1),
    '[^a-zA-Z0-9._]',
    '',
    'g'
  )
)
WHERE "username" IS NULL OR btrim("username") = '';

UPDATE "User" u
SET username = u.username || '_' || substr(u.id, 1, 6)
WHERE u.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY lower(username) ORDER BY "createdAt") AS rn
    FROM "User"
  ) t
  WHERE rn > 1
);

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_username_key'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_username_key" UNIQUE ("username");
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
