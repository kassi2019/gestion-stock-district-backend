/*
  Photo d'identité du personnel (affichée aussi pour son compte utilisateur).
  Image JPEG carrée (256 px) enregistrée au format texte « data:image/jpeg;base64,... ».
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[personnel] ADD [photo] NVARCHAR(max);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
