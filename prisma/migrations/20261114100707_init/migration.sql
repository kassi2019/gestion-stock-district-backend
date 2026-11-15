BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[roles] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(50) NOT NULL,
    [libelle] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(255),
    [permissions] NVARCHAR(max),
    CONSTRAINT [roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [roles_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[utilisateurs] (
    [id] INT NOT NULL IDENTITY(1,1),
    [login] NVARCHAR(50) NOT NULL,
    [motDePasseHash] NVARCHAR(255) NOT NULL,
    [nom] NVARCHAR(100) NOT NULL,
    [prenoms] NVARCHAR(150),
    [email] NVARCHAR(150),
    [telephone] NVARCHAR(30),
    [fonction] NVARCHAR(100),
    [roleId] INT NOT NULL,
    [actif] BIT NOT NULL CONSTRAINT [utilisateurs_actif_df] DEFAULT 1,
    [derniereConnexion] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [utilisateurs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [utilisateurs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [utilisateurs_login_key] UNIQUE NONCLUSTERED ([login])
);

-- CreateTable
CREATE TABLE [dbo].[parametres] (
    [cle] NVARCHAR(100) NOT NULL,
    [valeur] NVARCHAR(max) NOT NULL,
    [description] NVARCHAR(255),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [parametres_pkey] PRIMARY KEY CLUSTERED ([cle])
);

-- CreateTable
CREATE TABLE [dbo].[compteurs] (
    [id] INT NOT NULL IDENTITY(1,1),
    [type] NVARCHAR(30) NOT NULL,
    [annee] INT NOT NULL,
    [valeur] INT NOT NULL CONSTRAINT [compteurs_valeur_df] DEFAULT 0,
    CONSTRAINT [compteurs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [compteurs_type_annee_key] UNIQUE NONCLUSTERED ([type],[annee])
);

-- CreateTable
CREATE TABLE [dbo].[centres_sante] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [nom] NVARCHAR(150) NOT NULL,
    [type] NVARCHAR(50),
    [localite] NVARCHAR(100),
    [adresse] NVARCHAR(255),
    [responsable] NVARCHAR(150),
    [telephone] NVARCHAR(30),
    [email] NVARCHAR(150),
    [actif] BIT NOT NULL CONSTRAINT [centres_sante_actif_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [centres_sante_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [centres_sante_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [centres_sante_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[fournisseurs] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [raisonSociale] NVARCHAR(150) NOT NULL,
    [contact] NVARCHAR(150),
    [telephone] NVARCHAR(30),
    [email] NVARCHAR(150),
    [adresse] NVARCHAR(255),
    [actif] BIT NOT NULL CONSTRAINT [fournisseurs_actif_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [fournisseurs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [fournisseurs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fournisseurs_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[familles_produits] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [libelle] NVARCHAR(100) NOT NULL,
    [categorie] NVARCHAR(100),
    CONSTRAINT [familles_produits_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [familles_produits_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[medicaments] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [designation] NVARCHAR(200) NOT NULL,
    [forme] NVARCHAR(50),
    [dosage] NVARCHAR(50),
    [unite] NVARCHAR(30) NOT NULL,
    [conditionnement] NVARCHAR(100),
    [familleId] INT,
    [seuilAlerte] INT NOT NULL CONSTRAINT [medicaments_seuilAlerte_df] DEFAULT 0,
    [suiviLot] BIT NOT NULL CONSTRAINT [medicaments_suiviLot_df] DEFAULT 1,
    [actif] BIT NOT NULL CONSTRAINT [medicaments_actif_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [medicaments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [medicaments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [medicaments_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[prix_achat] (
    [id] INT NOT NULL IDENTITY(1,1),
    [medicamentId] INT NOT NULL,
    [fournisseurId] INT,
    [prix] DECIMAL(18,2) NOT NULL,
    [dateEffet] DATE NOT NULL,
    [dateFin] DATE,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [prix_achat_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [prix_achat_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[prix_vente] (
    [id] INT NOT NULL IDENTITY(1,1),
    [medicamentId] INT NOT NULL,
    [centreId] INT,
    [prix] DECIMAL(18,2) NOT NULL,
    [dateEffet] DATE NOT NULL,
    [dateFin] DATE,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [prix_vente_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [prix_vente_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[commandes_fournisseur] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [fournisseurId] INT NOT NULL,
    [dateCommande] DATE NOT NULL,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [commandes_fournisseur_statut_df] DEFAULT 'BROUILLON',
    [montantTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [commandes_fournisseur_montantTotal_df] DEFAULT 0,
    [observations] NVARCHAR(max),
    [utilisateurId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [commandes_fournisseur_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [commandes_fournisseur_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [commandes_fournisseur_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_commande_fournisseur] (
    [id] INT NOT NULL IDENTITY(1,1),
    [commandeId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantite] INT NOT NULL,
    [quantiteRecue] INT NOT NULL CONSTRAINT [lignes_commande_fournisseur_quantiteRecue_df] DEFAULT 0,
    [prixUnitaire] DECIMAL(18,2) NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [lignes_commande_fournisseur_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[receptions] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [commandeId] INT,
    [fournisseurId] INT NOT NULL,
    [dateReception] DATE NOT NULL,
    [numFactureFourn] NVARCHAR(50),
    [numBonLivraison] NVARCHAR(50),
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [receptions_statut_df] DEFAULT 'BROUILLON',
    [montantTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [receptions_montantTotal_df] DEFAULT 0,
    [observations] NVARCHAR(max),
    [utilisateurId] INT NOT NULL,
    [validePar] INT,
    [dateValidation] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [receptions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [receptions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [receptions_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_reception] (
    [id] INT NOT NULL IDENTITY(1,1),
    [receptionId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [lotId] INT,
    [numeroLot] NVARCHAR(50),
    [datePeremption] DATE,
    [quantite] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2) NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [lignes_reception_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[lots] (
    [id] INT NOT NULL IDENTITY(1,1),
    [medicamentId] INT NOT NULL,
    [numeroLot] NVARCHAR(50) NOT NULL,
    [datePeremption] DATE,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [lots_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [lots_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [lots_medicamentId_numeroLot_key] UNIQUE NONCLUSTERED ([medicamentId],[numeroLot])
);

-- CreateTable
CREATE TABLE [dbo].[stocks_depot] (
    [id] INT NOT NULL IDENTITY(1,1),
    [medicamentId] INT NOT NULL,
    [lotId] INT,
    [quantite] INT NOT NULL CONSTRAINT [stocks_depot_quantite_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [stocks_depot_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [stocks_depot_medicamentId_lotId_key] UNIQUE NONCLUSTERED ([medicamentId],[lotId])
);

-- CreateTable
CREATE TABLE [dbo].[mouvements_stock] (
    [id] INT NOT NULL IDENTITY(1,1),
    [dateMouvement] DATETIME2 NOT NULL CONSTRAINT [mouvements_stock_dateMouvement_df] DEFAULT CURRENT_TIMESTAMP,
    [type] NVARCHAR(30) NOT NULL,
    [medicamentId] INT NOT NULL,
    [lotId] INT,
    [quantite] INT NOT NULL,
    [stockAvant] INT NOT NULL,
    [stockApres] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2),
    [motif] NVARCHAR(255),
    [pieceRef] NVARCHAR(50),
    [sourceType] NVARCHAR(30),
    [sourceId] INT,
    [utilisateurId] INT NOT NULL,
    CONSTRAINT [mouvements_stock_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[inventaires_depot] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [dateInventaire] DATE NOT NULL,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [inventaires_depot_statut_df] DEFAULT 'EN_COURS',
    [observations] NVARCHAR(max),
    [utilisateurId] INT NOT NULL,
    [validePar] INT,
    [dateValidation] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [inventaires_depot_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [inventaires_depot_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [inventaires_depot_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_inventaire_depot] (
    [id] INT NOT NULL IDENTITY(1,1),
    [inventaireId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [lotId] INT,
    [stockTheorique] INT NOT NULL,
    [stockPhysique] INT NOT NULL,
    [ecart] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2),
    [valeurEcart] DECIMAL(18,2),
    [commentaire] NVARCHAR(255),
    CONSTRAINT [lignes_inventaire_depot_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[commandes_centre] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [centreId] INT NOT NULL,
    [dateCommande] DATE NOT NULL,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [commandes_centre_statut_df] DEFAULT 'BROUILLON',
    [observations] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [commandes_centre_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [commandes_centre_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [commandes_centre_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_commande_centre] (
    [id] INT NOT NULL IDENTITY(1,1),
    [commandeId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantiteDemandee] INT NOT NULL,
    [quantiteAccordee] INT,
    CONSTRAINT [lignes_commande_centre_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[livraisons] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [centreId] INT NOT NULL,
    [commandeId] INT,
    [dateLivraison] DATE NOT NULL,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [livraisons_statut_df] DEFAULT 'BROUILLON',
    [montantTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [livraisons_montantTotal_df] DEFAULT 0,
    [observations] NVARCHAR(max),
    [utilisateurId] INT NOT NULL,
    [validePar] INT,
    [dateValidation] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [livraisons_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [livraisons_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [livraisons_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_livraison] (
    [id] INT NOT NULL IDENTITY(1,1),
    [livraisonId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [lotId] INT,
    [quantitePreparee] INT NOT NULL,
    [quantiteLivree] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2) NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [lignes_livraison_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[stocks_centre] (
    [id] INT NOT NULL IDENTITY(1,1),
    [centreId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantiteTheorique] INT NOT NULL CONSTRAINT [stocks_centre_quantiteTheorique_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [stocks_centre_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [stocks_centre_centreId_medicamentId_key] UNIQUE NONCLUSTERED ([centreId],[medicamentId])
);

-- CreateTable
CREATE TABLE [dbo].[mouvements_stock_centre] (
    [id] INT NOT NULL IDENTITY(1,1),
    [dateMouvement] DATETIME2 NOT NULL CONSTRAINT [mouvements_stock_centre_dateMouvement_df] DEFAULT CURRENT_TIMESTAMP,
    [type] NVARCHAR(30) NOT NULL,
    [centreId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantite] INT NOT NULL,
    [stockAvant] INT NOT NULL,
    [stockApres] INT NOT NULL,
    [motif] NVARCHAR(255),
    [sourceType] NVARCHAR(30),
    [sourceId] INT,
    [utilisateurId] INT NOT NULL,
    CONSTRAINT [mouvements_stock_centre_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[rapports_consommation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [centreId] INT NOT NULL,
    [annee] INT NOT NULL,
    [mois] INT NOT NULL,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [rapports_consommation_statut_df] DEFAULT 'BROUILLON',
    [montantTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [rapports_consommation_montantTotal_df] DEFAULT 0,
    [observations] NVARCHAR(max),
    [utilisateurId] INT NOT NULL,
    [dateSoumission] DATETIME2,
    [validePar] INT,
    [dateValidation] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [rapports_consommation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [rapports_consommation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [rapports_consommation_numero_key] UNIQUE NONCLUSTERED ([numero]),
    CONSTRAINT [rapports_consommation_centreId_annee_mois_key] UNIQUE NONCLUSTERED ([centreId],[annee],[mois])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_consommation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [rapportId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantite] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2) NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [lignes_consommation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [lignes_consommation_rapportId_medicamentId_key] UNIQUE NONCLUSTERED ([rapportId],[medicamentId])
);

-- CreateTable
CREATE TABLE [dbo].[factures] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [type] NVARCHAR(30) NOT NULL CONSTRAINT [factures_type_df] DEFAULT 'CONSOMMATION',
    [centreId] INT NOT NULL,
    [rapportId] INT,
    [supervisionId] INT,
    [dateEmission] DATE NOT NULL,
    [dateEcheance] DATE,
    [montantTotal] DECIMAL(18,2) NOT NULL,
    [montantPaye] DECIMAL(18,2) NOT NULL CONSTRAINT [factures_montantPaye_df] DEFAULT 0,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [factures_statut_df] DEFAULT 'EMISE',
    [motifAnnulation] NVARCHAR(255),
    [utilisateurId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [factures_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [factures_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [factures_numero_key] UNIQUE NONCLUSTERED ([numero]),
    CONSTRAINT [factures_rapportId_key] UNIQUE NONCLUSTERED ([rapportId]),
    CONSTRAINT [factures_supervisionId_key] UNIQUE NONCLUSTERED ([supervisionId])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_facture] (
    [id] INT NOT NULL IDENTITY(1,1),
    [factureId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [quantite] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2) NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [lignes_facture_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[paiements] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [centreId] INT NOT NULL,
    [datePaiement] DATE NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    [montantNonImpute] DECIMAL(18,2) NOT NULL CONSTRAINT [paiements_montantNonImpute_df] DEFAULT 0,
    [type] NVARCHAR(20) NOT NULL CONSTRAINT [paiements_type_df] DEFAULT 'PAIEMENT',
    [mode] NVARCHAR(20) NOT NULL,
    [reference] NVARCHAR(100),
    [observations] NVARCHAR(255),
    [annule] BIT NOT NULL CONSTRAINT [paiements_annule_df] DEFAULT 0,
    [utilisateurId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [paiements_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [paiements_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [paiements_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[imputations] (
    [id] INT NOT NULL IDENTITY(1,1),
    [paiementId] INT NOT NULL,
    [factureId] INT NOT NULL,
    [montant] DECIMAL(18,2) NOT NULL,
    [date] DATETIME2 NOT NULL CONSTRAINT [imputations_date_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [imputations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[supervisions] (
    [id] INT NOT NULL IDENTITY(1,1),
    [numero] NVARCHAR(30) NOT NULL,
    [centreId] INT NOT NULL,
    [dateSupervision] DATE NOT NULL,
    [statut] NVARCHAR(30) NOT NULL CONSTRAINT [supervisions_statut_df] DEFAULT 'BROUILLON',
    [observations] NVARCHAR(max),
    [valeurEcartTotal] DECIMAL(18,2) NOT NULL CONSTRAINT [supervisions_valeurEcartTotal_df] DEFAULT 0,
    [decision] NVARCHAR(30),
    [motifDecision] NVARCHAR(max),
    [utilisateurId] INT NOT NULL,
    [validePar] INT,
    [dateValidation] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [supervisions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [supervisions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [supervisions_numero_key] UNIQUE NONCLUSTERED ([numero])
);

-- CreateTable
CREATE TABLE [dbo].[supervision_agents] (
    [id] INT NOT NULL IDENTITY(1,1),
    [supervisionId] INT NOT NULL,
    [utilisateurId] INT,
    [nom] NVARCHAR(150),
    [fonction] NVARCHAR(100),
    CONSTRAINT [supervision_agents_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[lignes_supervision] (
    [id] INT NOT NULL IDENTITY(1,1),
    [supervisionId] INT NOT NULL,
    [medicamentId] INT NOT NULL,
    [lotId] INT,
    [stockTheorique] INT NOT NULL,
    [stockPhysique] INT NOT NULL,
    [ecart] INT NOT NULL,
    [prixUnitaire] DECIMAL(18,2),
    [valeurEcart] DECIMAL(18,2),
    [commentaire] NVARCHAR(255),
    CONSTRAINT [lignes_supervision_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[pieces_jointes] (
    [id] INT NOT NULL IDENTITY(1,1),
    [entiteType] NVARCHAR(50) NOT NULL,
    [entiteId] INT NOT NULL,
    [libelle] NVARCHAR(150),
    [nomFichier] NVARCHAR(255) NOT NULL,
    [chemin] NVARCHAR(500) NOT NULL,
    [mimeType] NVARCHAR(100),
    [taille] INT,
    [utilisateurId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [pieces_jointes_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [pieces_jointes_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[journal_audit] (
    [id] INT NOT NULL IDENTITY(1,1),
    [dateAction] DATETIME2 NOT NULL CONSTRAINT [journal_audit_dateAction_df] DEFAULT CURRENT_TIMESTAMP,
    [utilisateurId] INT,
    [action] NVARCHAR(50) NOT NULL,
    [entite] NVARCHAR(50) NOT NULL,
    [entiteId] NVARCHAR(50),
    [valeursAvant] NVARCHAR(max),
    [valeursApres] NVARCHAR(max),
    [adresseIp] NVARCHAR(50),
    CONSTRAINT [journal_audit_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [prix_achat_medicamentId_dateEffet_idx] ON [dbo].[prix_achat]([medicamentId], [dateEffet]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [prix_vente_medicamentId_centreId_dateEffet_idx] ON [dbo].[prix_vente]([medicamentId], [centreId], [dateEffet]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [mouvements_stock_medicamentId_dateMouvement_idx] ON [dbo].[mouvements_stock]([medicamentId], [dateMouvement]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [mouvements_stock_sourceType_sourceId_idx] ON [dbo].[mouvements_stock]([sourceType], [sourceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [mouvements_stock_centre_centreId_medicamentId_dateMouvement_idx] ON [dbo].[mouvements_stock_centre]([centreId], [medicamentId], [dateMouvement]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [factures_centreId_dateEmission_idx] ON [dbo].[factures]([centreId], [dateEmission]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [paiements_centreId_datePaiement_idx] ON [dbo].[paiements]([centreId], [datePaiement]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [pieces_jointes_entiteType_entiteId_idx] ON [dbo].[pieces_jointes]([entiteType], [entiteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [journal_audit_entite_entiteId_idx] ON [dbo].[journal_audit]([entite], [entiteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [journal_audit_dateAction_idx] ON [dbo].[journal_audit]([dateAction]);

-- AddForeignKey
ALTER TABLE [dbo].[utilisateurs] ADD CONSTRAINT [utilisateurs_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[roles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[medicaments] ADD CONSTRAINT [medicaments_familleId_fkey] FOREIGN KEY ([familleId]) REFERENCES [dbo].[familles_produits]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[prix_achat] ADD CONSTRAINT [prix_achat_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[prix_achat] ADD CONSTRAINT [prix_achat_fournisseurId_fkey] FOREIGN KEY ([fournisseurId]) REFERENCES [dbo].[fournisseurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[prix_vente] ADD CONSTRAINT [prix_vente_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[prix_vente] ADD CONSTRAINT [prix_vente_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[commandes_fournisseur] ADD CONSTRAINT [commandes_fournisseur_fournisseurId_fkey] FOREIGN KEY ([fournisseurId]) REFERENCES [dbo].[fournisseurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[commandes_fournisseur] ADD CONSTRAINT [commandes_fournisseur_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_commande_fournisseur] ADD CONSTRAINT [lignes_commande_fournisseur_commandeId_fkey] FOREIGN KEY ([commandeId]) REFERENCES [dbo].[commandes_fournisseur]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_commande_fournisseur] ADD CONSTRAINT [lignes_commande_fournisseur_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receptions] ADD CONSTRAINT [receptions_commandeId_fkey] FOREIGN KEY ([commandeId]) REFERENCES [dbo].[commandes_fournisseur]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receptions] ADD CONSTRAINT [receptions_fournisseurId_fkey] FOREIGN KEY ([fournisseurId]) REFERENCES [dbo].[fournisseurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receptions] ADD CONSTRAINT [receptions_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receptions] ADD CONSTRAINT [receptions_validePar_fkey] FOREIGN KEY ([validePar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_reception] ADD CONSTRAINT [lignes_reception_receptionId_fkey] FOREIGN KEY ([receptionId]) REFERENCES [dbo].[receptions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_reception] ADD CONSTRAINT [lignes_reception_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_reception] ADD CONSTRAINT [lignes_reception_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lots] ADD CONSTRAINT [lots_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[stocks_depot] ADD CONSTRAINT [stocks_depot_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[stocks_depot] ADD CONSTRAINT [stocks_depot_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mouvements_stock] ADD CONSTRAINT [mouvements_stock_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mouvements_stock] ADD CONSTRAINT [mouvements_stock_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mouvements_stock] ADD CONSTRAINT [mouvements_stock_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inventaires_depot] ADD CONSTRAINT [inventaires_depot_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inventaires_depot] ADD CONSTRAINT [inventaires_depot_validePar_fkey] FOREIGN KEY ([validePar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_inventaire_depot] ADD CONSTRAINT [lignes_inventaire_depot_inventaireId_fkey] FOREIGN KEY ([inventaireId]) REFERENCES [dbo].[inventaires_depot]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_inventaire_depot] ADD CONSTRAINT [lignes_inventaire_depot_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_inventaire_depot] ADD CONSTRAINT [lignes_inventaire_depot_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[commandes_centre] ADD CONSTRAINT [commandes_centre_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_commande_centre] ADD CONSTRAINT [lignes_commande_centre_commandeId_fkey] FOREIGN KEY ([commandeId]) REFERENCES [dbo].[commandes_centre]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_commande_centre] ADD CONSTRAINT [lignes_commande_centre_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[livraisons] ADD CONSTRAINT [livraisons_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[livraisons] ADD CONSTRAINT [livraisons_commandeId_fkey] FOREIGN KEY ([commandeId]) REFERENCES [dbo].[commandes_centre]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[livraisons] ADD CONSTRAINT [livraisons_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[livraisons] ADD CONSTRAINT [livraisons_validePar_fkey] FOREIGN KEY ([validePar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_livraison] ADD CONSTRAINT [lignes_livraison_livraisonId_fkey] FOREIGN KEY ([livraisonId]) REFERENCES [dbo].[livraisons]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_livraison] ADD CONSTRAINT [lignes_livraison_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_livraison] ADD CONSTRAINT [lignes_livraison_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[stocks_centre] ADD CONSTRAINT [stocks_centre_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[stocks_centre] ADD CONSTRAINT [stocks_centre_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mouvements_stock_centre] ADD CONSTRAINT [mouvements_stock_centre_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mouvements_stock_centre] ADD CONSTRAINT [mouvements_stock_centre_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mouvements_stock_centre] ADD CONSTRAINT [mouvements_stock_centre_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rapports_consommation] ADD CONSTRAINT [rapports_consommation_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rapports_consommation] ADD CONSTRAINT [rapports_consommation_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rapports_consommation] ADD CONSTRAINT [rapports_consommation_validePar_fkey] FOREIGN KEY ([validePar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_consommation] ADD CONSTRAINT [lignes_consommation_rapportId_fkey] FOREIGN KEY ([rapportId]) REFERENCES [dbo].[rapports_consommation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_consommation] ADD CONSTRAINT [lignes_consommation_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[factures] ADD CONSTRAINT [factures_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[factures] ADD CONSTRAINT [factures_rapportId_fkey] FOREIGN KEY ([rapportId]) REFERENCES [dbo].[rapports_consommation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[factures] ADD CONSTRAINT [factures_supervisionId_fkey] FOREIGN KEY ([supervisionId]) REFERENCES [dbo].[supervisions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[factures] ADD CONSTRAINT [factures_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_facture] ADD CONSTRAINT [lignes_facture_factureId_fkey] FOREIGN KEY ([factureId]) REFERENCES [dbo].[factures]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_facture] ADD CONSTRAINT [lignes_facture_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[paiements] ADD CONSTRAINT [paiements_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[paiements] ADD CONSTRAINT [paiements_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[imputations] ADD CONSTRAINT [imputations_paiementId_fkey] FOREIGN KEY ([paiementId]) REFERENCES [dbo].[paiements]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[imputations] ADD CONSTRAINT [imputations_factureId_fkey] FOREIGN KEY ([factureId]) REFERENCES [dbo].[factures]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[supervisions] ADD CONSTRAINT [supervisions_centreId_fkey] FOREIGN KEY ([centreId]) REFERENCES [dbo].[centres_sante]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[supervisions] ADD CONSTRAINT [supervisions_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[supervisions] ADD CONSTRAINT [supervisions_validePar_fkey] FOREIGN KEY ([validePar]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[supervision_agents] ADD CONSTRAINT [supervision_agents_supervisionId_fkey] FOREIGN KEY ([supervisionId]) REFERENCES [dbo].[supervisions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[supervision_agents] ADD CONSTRAINT [supervision_agents_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_supervision] ADD CONSTRAINT [lignes_supervision_supervisionId_fkey] FOREIGN KEY ([supervisionId]) REFERENCES [dbo].[supervisions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_supervision] ADD CONSTRAINT [lignes_supervision_medicamentId_fkey] FOREIGN KEY ([medicamentId]) REFERENCES [dbo].[medicaments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[lignes_supervision] ADD CONSTRAINT [lignes_supervision_lotId_fkey] FOREIGN KEY ([lotId]) REFERENCES [dbo].[lots]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[pieces_jointes] ADD CONSTRAINT [pieces_jointes_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[journal_audit] ADD CONSTRAINT [journal_audit_utilisateurId_fkey] FOREIGN KEY ([utilisateurId]) REFERENCES [dbo].[utilisateurs]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
