/*
  Rapport centre présenté comme la fiche « Rapport commande mensuel recouvrables » :
    - stockRestant : quantité restante COMPTÉE au centre (saisie) ;
    - joursRupture : jours de rupture du mois (corrige la CMM) ;
    - paramètres d'en-tête : niveau de stock minimum, point de commande urgente,
      délai de réapprovisionnement (en mois).
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[lignes_consommation] ADD [stockRestant] INT NULL,
[joursRupture] INT NOT NULL CONSTRAINT [lignes_consommation_joursRupture_df] DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = 'MOIS_STOCK_MIN')
  INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
  VALUES ('MOIS_STOCK_MIN', '1', 'Niveau de stock minimum (en mois de consommation)', CURRENT_TIMESTAMP);

IF NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = 'MOIS_POINT_COMMANDE_URGENTE')
  INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
  VALUES ('MOIS_POINT_COMMANDE_URGENTE', '0.5', 'Point de commande urgente (en mois de consommation)', CURRENT_TIMESTAMP);

IF NOT EXISTS (SELECT 1 FROM [dbo].[parametres] WHERE [cle] = 'DELAI_REAPPRO_MOIS')
  INSERT INTO [dbo].[parametres] ([cle], [valeur], [description], [updatedAt])
  VALUES ('DELAI_REAPPRO_MOIS', '1', 'Délai de réapprovisionnement des centres (en mois)', CURRENT_TIMESTAMP);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
