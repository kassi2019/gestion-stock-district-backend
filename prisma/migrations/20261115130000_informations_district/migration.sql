/*
  Informations du district (Paramètres généraux) : nouvelles clés dans la
  table "parametres", à côté de NOM_DISTRICT (déjà existant).
  Ajoutées seulement si elles n'existent pas encore (valeur vide au départ).
*/
BEGIN TRY

BEGIN TRAN;

INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
SELECT n.[cle], N'', n.[description], GETDATE()
FROM (VALUES
  (N'DISTRICT_CODE',        N'Code du district'),
  (N'DISTRICT_REGION',      N'Région sanitaire'),
  (N'DISTRICT_LOCALITE',    N'Ville / localité du siège'),
  (N'DISTRICT_ADRESSE',     N'Adresse du siège'),
  (N'DISTRICT_LATITUDE',    N'Latitude GPS du siège (degrés décimaux)'),
  (N'DISTRICT_LONGITUDE',   N'Longitude GPS du siège (degrés décimaux)'),
  (N'DISTRICT_RESPONSABLE', N'Responsable du district (directeur / médecin-chef)'),
  (N'DISTRICT_TELEPHONE',   N'Téléphone du district'),
  (N'DISTRICT_EMAIL',       N'E-mail du district')
) AS n([cle], [description])
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[parametres] p WHERE p.[cle] = n.[cle]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
