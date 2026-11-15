/*
  Unités de vente : nouvelle table "unites_vente".
  La colonne texte medicaments.uniteVente (BOITE, PLAQUE...) est remplacée par
  medicaments.uniteVenteId. Chaque médicament garde son unité :
    1. on crée la table avec les unités habituelles (mêmes codes qu'avant) ;
    2. on relie chaque médicament à son unité (par le code) ;
    3. on supprime l'ancienne colonne (et sa valeur par défaut).
  (Les instructions qui utilisent la nouvelle colonne passent par EXEC, car
   SQL Server refuse une colonne créée dans le même lot d'instructions.)
*/
BEGIN TRY

BEGIN TRAN;

-- 1. Table des unités de vente
CREATE TABLE [dbo].[unites_vente] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [libelle] NVARCHAR(100) NOT NULL,
    CONSTRAINT [unites_vente_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [unites_vente_code_key] UNIQUE NONCLUSTERED ([code])
);

INSERT INTO [dbo].[unites_vente] ([code], [libelle]) VALUES
  (N'BOITE', N'Boîte'), (N'PLAQUE', N'Plaque'), (N'FLACON', N'Flacon'), (N'TUBE', N'Tube'),
  (N'AMPOULE', N'Ampoule'), (N'SACHET', N'Sachet'), (N'UNITE', N'Unité');

-- 2. Lien médicament -> unité de vente
ALTER TABLE [dbo].[medicaments] ADD [uniteVenteId] INT;

EXEC(N'UPDATE m SET m.[uniteVenteId] = u.[id]
       FROM [dbo].[medicaments] m
       JOIN [dbo].[unites_vente] u ON u.[code] = m.[uniteVente]');

-- 3. Suppression de l'ancienne colonne (d'abord sa valeur par défaut)
ALTER TABLE [dbo].[medicaments] DROP CONSTRAINT [medicaments_uniteVente_df];
ALTER TABLE [dbo].[medicaments] DROP COLUMN [uniteVente];

EXEC(N'ALTER TABLE [dbo].[medicaments] ADD CONSTRAINT [medicaments_uniteVenteId_fkey] FOREIGN KEY ([uniteVenteId])
       REFERENCES [dbo].[unites_vente]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
