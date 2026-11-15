/*
  Warnings:

  - You are about to drop the column `type` on the `centres_sante` table. All the data in the column will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[centres_sante] DROP COLUMN [type];
ALTER TABLE [dbo].[centres_sante] ADD [latitude] DECIMAL(9,6),
[longitude] DECIMAL(9,6),
[typeId] INT;

-- CreateTable
CREATE TABLE [dbo].[types_centre] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [libelle] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(255),
    CONSTRAINT [types_centre_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [types_centre_code_key] UNIQUE NONCLUSTERED ([code])
);

-- AddForeignKey
ALTER TABLE [dbo].[centres_sante] ADD CONSTRAINT [centres_sante_typeId_fkey] FOREIGN KEY ([typeId]) REFERENCES [dbo].[types_centre]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
