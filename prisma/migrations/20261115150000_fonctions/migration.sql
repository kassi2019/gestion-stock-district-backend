/*
  FONCTIONS DU PERSONNEL : nouvelle table "fonctions".
  La colonne texte personnel.fonction est remplacée par personnel.fonctionId.
  Les fonctions déjà saisies sont reprises (codes FCT-0001, FCT-0002...) et
  chaque fiche est reliée à sa fonction. (Le compte utilisateur garde une
  copie du libellé dans utilisateurs.fonction.)
  (Les instructions qui utilisent la nouvelle colonne passent par EXEC, car
   SQL Server refuse une colonne créée dans le même lot d'instructions.)
*/
BEGIN TRY

BEGIN TRAN;

-- 1. Table des fonctions
CREATE TABLE [dbo].[fonctions] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [libelle] NVARCHAR(100) NOT NULL,
    CONSTRAINT [fonctions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fonctions_code_key] UNIQUE NONCLUSTERED ([code])
);

-- Fonctions déjà saisies dans les fiches du personnel
INSERT INTO [dbo].[fonctions] ([code], [libelle])
SELECT N'FCT-' + RIGHT(N'0000' + CAST(ROW_NUMBER() OVER (ORDER BY f.fonction) AS NVARCHAR(10)), 4), f.fonction
FROM (
  SELECT DISTINCT LTRIM(RTRIM([fonction])) AS fonction FROM [dbo].[personnel]
  WHERE [fonction] IS NOT NULL AND LTRIM(RTRIM([fonction])) <> N''
) f;

-- Compteur des codes automatiques : on repart après les fonctions reprises
INSERT INTO [dbo].[compteurs] ([type], [annee], [valeur])
SELECT N'CODE_FCT', 0, COUNT(*) FROM [dbo].[fonctions]
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[compteurs] WHERE [type] = N'CODE_FCT' AND [annee] = 0);

-- 2. Lien fiche du personnel -> fonction
ALTER TABLE [dbo].[personnel] ADD [fonctionId] INT;

EXEC(N'UPDATE p SET p.[fonctionId] = f.[id]
       FROM [dbo].[personnel] p
       JOIN [dbo].[fonctions] f ON f.[libelle] = LTRIM(RTRIM(p.[fonction]))');

ALTER TABLE [dbo].[personnel] DROP COLUMN [fonction];

EXEC(N'ALTER TABLE [dbo].[personnel] ADD CONSTRAINT [personnel_fonctionId_fkey] FOREIGN KEY ([fonctionId])
       REFERENCES [dbo].[fonctions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
