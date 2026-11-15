BEGIN TRY

BEGIN TRAN;

-- AlterTable : nouvelle colonne "consommable" (non par défaut)
ALTER TABLE [dbo].[medicaments] ADD [consommable] BIT NOT NULL CONSTRAINT [medicaments_consommable_df] DEFAULT 0;

-- AlterTable : unité de vente (BOITE ou PLAQUE), Boîte par défaut
ALTER TABLE [dbo].[medicaments] ADD [uniteVente] NVARCHAR(20) NOT NULL CONSTRAINT [medicaments_uniteVente_df] DEFAULT 'BOITE';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
