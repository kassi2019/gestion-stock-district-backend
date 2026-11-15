/*
  Stock du LOT avant / après chaque mouvement du dépôt (en plus du stock total
  du médicament) : sert à la fiche d'inventaire (stock théorique / compté par lot).
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[mouvements_stock] ADD [stockLotAvant] INT, [stockLotApres] INT;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
