/*
  Retours de recette — module Réception (nov. 2026) :
    - le prix d'achat est désormais SAISI sur chaque ligne de réception
      (proposé par défaut, modifiable) : pas de changement de structure,
      la colonne prixUnitaire existe déjà ;
    - nouvelle observation facultative PAR LIGNE de réception
      (en plus de l'observation générale de la réception).
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[lignes_reception] ADD [observation] NVARCHAR(500) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
