/*
  PERSONNEL ET DROITS PAR MODULE
    1. Nouvelle table "personnel" (un compte utilisateur est rattaché à un
       membre du personnel) ;
    2. Les comptes EXISTANTS sont repris : une fiche personnel est créée pour
       chacun (matricule PER-0001, PER-0002...) avec son nom, sa fonction et
       ses contacts, puis le compte y est rattaché ;
    3. Droits de départ des profils (colonne roles.permissions, en JSON),
       identiques aux accès d'avant (l'ADMIN a toujours tout).
  (Les instructions qui utilisent une colonne créée dans ce script passent
   par EXEC, car SQL Server refuse une colonne créée dans le même lot.)
*/
BEGIN TRY

BEGIN TRAN;

-- 1. Table du personnel
CREATE TABLE [dbo].[personnel] (
    [id] INT NOT NULL IDENTITY(1,1),
    [matricule] NVARCHAR(30) NOT NULL,
    [nom] NVARCHAR(100) NOT NULL,
    [prenoms] NVARCHAR(150),
    [fonction] NVARCHAR(100),
    [centreId] INT,
    [telephone] NVARCHAR(30),
    [email] NVARCHAR(150),
    [actif] BIT NOT NULL CONSTRAINT [personnel_actif_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [personnel_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [personnel_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [personnel_matricule_key] UNIQUE NONCLUSTERED ([matricule])
);

ALTER TABLE [dbo].[personnel] ADD CONSTRAINT [personnel_centreId_fkey] FOREIGN KEY ([centreId])
  REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[utilisateurs] ADD [personnelId] INT;

-- 2. Reprise des comptes existants (une fiche personnel par compte)
INSERT INTO [dbo].[personnel] ([matricule], [nom], [prenoms], [fonction], [telephone], [email], [actif], [updatedAt])
SELECT N'PER-' + RIGHT(N'0000' + CAST(u.[id] AS NVARCHAR(10)), 4), u.[nom], u.[prenoms], u.[fonction],
       u.[telephone], u.[email], u.[actif], GETDATE()
FROM [dbo].[utilisateurs] u;

EXEC(N'UPDATE u SET u.[personnelId] = p.[id]
       FROM [dbo].[utilisateurs] u
       JOIN [dbo].[personnel] p ON p.[matricule] = N''PER-'' + RIGHT(N''0000'' + CAST(u.[id] AS NVARCHAR(10)), 4)');

EXEC(N'ALTER TABLE [dbo].[utilisateurs] ADD CONSTRAINT [utilisateurs_personnelId_fkey] FOREIGN KEY ([personnelId])
       REFERENCES [dbo].[personnel]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

-- Compteur des matricules automatiques : on repart après les fiches créées
IF NOT EXISTS (SELECT 1 FROM [dbo].[compteurs] WHERE [type] = N'CODE_PER' AND [annee] = 0)
  INSERT INTO [dbo].[compteurs] ([type], [annee], [valeur])
  SELECT N'CODE_PER', 0, ISNULL(MAX([id]), 0) FROM [dbo].[utilisateurs];

-- 3. Droits de départ des profils (seulement s'ils n'ont pas encore de droits)
UPDATE [dbo].[roles] SET [permissions] = N'{"achats":"MODIFICATION","stock":"MODIFICATION","livraisons":"MODIFICATION","rapports":"MODIFICATION"}'
  WHERE [code] = N'GESTIONNAIRE_DEPOT' AND [permissions] IS NULL;
UPDATE [dbo].[roles] SET [permissions] = N'{"consommations":"MODIFICATION"}'
  WHERE [code] = N'AGENT_SAISIE' AND [permissions] IS NULL;
UPDATE [dbo].[roles] SET [permissions] = N'{"facturation":"MODIFICATION","paiements":"MODIFICATION","rapports":"MODIFICATION"}'
  WHERE [code] = N'COMPTABLE' AND [permissions] IS NULL;
UPDATE [dbo].[roles] SET [permissions] = N'{"supervisions":"MODIFICATION"}'
  WHERE [code] = N'SUPERVISEUR' AND [permissions] IS NULL;
UPDATE [dbo].[roles] SET [permissions] = N'{"stock":"MODIFICATION","consommations":"MODIFICATION","facturation":"MODIFICATION","supervisions":"MODIFICATION","rapports":"MODIFICATION"}'
  WHERE [code] = N'RESPONSABLE_DISTRICT' AND [permissions] IS NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
