/*
  Paramètre « Sortie automatique des lots périmés » (traitement de nuit) :
  activé par défaut. Modifiable dans Paramétrage > Paramètres généraux.
*/
BEGIN TRY

BEGIN TRAN;

INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
SELECT N'SORTIE_AUTO_PERIMES', N'true', N'Sortir automatiquement du stock, chaque nuit, les lots périmés', GETDATE()
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = N'SORTIE_AUTO_PERIMES');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
