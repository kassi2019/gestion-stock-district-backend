/*
  Formes de médicaments : nouvelle table "formes_medicament".
  La colonne texte medicaments.forme est remplacée par medicaments.formeId.
  Les formes déjà saisies sont reprises (rien n'est perdu) :
    1. on crée la table avec les formes habituelles ;
    2. on y ajoute les autres formes déjà utilisées par des médicaments ;
    3. on relie chaque médicament à sa forme, puis on supprime l'ancienne colonne.
  (Les instructions qui utilisent la nouvelle colonne passent par EXEC, car
   SQL Server refuse une colonne créée dans le même lot d'instructions.)
*/
BEGIN TRY

BEGIN TRAN;

-- 1. Table des formes
CREATE TABLE [dbo].[formes_medicament] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [libelle] NVARCHAR(100) NOT NULL,
    CONSTRAINT [formes_medicament_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [formes_medicament_code_key] UNIQUE NONCLUSTERED ([code])
);

-- Formes habituelles
INSERT INTO [dbo].[formes_medicament] ([code], [libelle]) VALUES
  (N'COMPRIME', N'Comprimé'), (N'GELULE', N'Gélule'), (N'SIROP', N'Sirop'),
  (N'SUSPENSION', N'Suspension'), (N'INJECTABLE', N'Injectable'), (N'PERFUSION', N'Perfusion'),
  (N'POMMADE', N'Pommade'), (N'CREME', N'Crème'), (N'COLLYRE', N'Collyre'),
  (N'SUPPOSITOIRE', N'Suppositoire'), (N'SACHET', N'Sachet'), (N'OVULE', N'Ovule'), (N'AUTRE', N'Autre');

-- 2. Autres formes déjà saisies dans les médicaments (codes FRM-0001, FRM-0002...)
INSERT INTO [dbo].[formes_medicament] ([code], [libelle])
SELECT N'FRM-' + RIGHT(N'0000' + CAST(ROW_NUMBER() OVER (ORDER BY f.forme) AS NVARCHAR(10)), 4), f.forme
FROM (
  SELECT DISTINCT LTRIM(RTRIM([forme])) AS forme FROM [dbo].[medicaments]
  WHERE [forme] IS NOT NULL AND LTRIM(RTRIM([forme])) <> N''
) f
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[formes_medicament] fm WHERE fm.[libelle] = f.forme);

-- 3. Lien médicament -> forme
ALTER TABLE [dbo].[medicaments] ADD [formeId] INT;

EXEC(N'UPDATE m SET m.[formeId] = fm.[id]
       FROM [dbo].[medicaments] m
       JOIN [dbo].[formes_medicament] fm ON fm.[libelle] = LTRIM(RTRIM(m.[forme]))');

ALTER TABLE [dbo].[medicaments] DROP COLUMN [forme];

EXEC(N'ALTER TABLE [dbo].[medicaments] ADD CONSTRAINT [medicaments_formeId_fkey] FOREIGN KEY ([formeId])
       REFERENCES [dbo].[formes_medicament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
