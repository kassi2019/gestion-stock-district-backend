/**
 * =============================================================================
 * DONNÉES ATTENDUES — RAPPORT CENTRE DE SANTÉ (spec nov. 2026, §5)
 * =============================================================================
 * Le district saisit seulement, comme sur la fiche papier : la quantité
 * UTILISÉE, la quantité RESTANTE comptée, les jours de rupture, la quantité
 * ACCORDÉE, et les transferts cédés à un autre centre.
 * Tout le reste (SI, R, perte/ajustement, CMM, quantité à commander...) est
 * CALCULÉ par le serveur.
 * =============================================================================
 */
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** Ouvrir (ou créer) le rapport d'un centre pour un mois. */
export class OuvrirRapportCentreDto {
  @IsInt({ message: 'Choisissez le centre de santé' })
  centreId!: number;

  @Type(() => Number)
  @IsInt() @Min(2020) @Max(2100)
  annee!: number;

  @Type(() => Number)
  @IsInt() @Min(1, { message: 'Mois invalide' }) @Max(12, { message: 'Mois invalide' })
  mois!: number;
}

/** Saisie d'une ligne (un produit). */
export class LigneRapportCentreDto {
  @IsInt({ message: 'Choisissez le produit' })
  medicamentId!: number;

  /** C : quantité consommée */
  @Type(() => Number)
  @IsInt({ message: 'La consommation doit être un nombre entier' })
  @Min(0, { message: 'La consommation ne peut pas être négative' })
  consomme!: number;

  /** Quantité restante comptée au centre. Absente ou null = stock théorique retenu. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La quantité restante doit être un nombre entier' })
  @Min(0, { message: 'La quantité restante ne peut pas être négative' })
  stockRestant?: number | null;

  /** Nombre de jours de rupture dans le mois (0 à 30). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Les jours de rupture doivent être un nombre entier' })
  @Min(0, { message: 'Les jours de rupture ne peuvent pas être négatifs' })
  @Max(30, { message: 'Les jours de rupture ne peuvent pas dépasser 30' })
  joursRupture?: number;

  /** Quantité ACCORDÉE. Absente ou null = proposition (quantité à commander, limitée au stock du district). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La quantité validée doit être un nombre entier' })
  @Min(0, { message: 'La quantité validée ne peut pas être négative' })
  quantiteValidee?: number | null;
}

/** Enregistrement du brouillon : toutes les lignes saisies. */
export class EnregistrerRapportCentreDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneRapportCentreDto)
  lignes!: LigneRapportCentreDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;
}

/** Transfert CÉDÉ par le centre du rapport à un autre centre (même mois). */
export class CreerTransfertDto {
  @IsInt({ message: 'Choisissez le centre qui reçoit' })
  centreDestinationId!: number;

  @IsInt({ message: 'Choisissez le produit' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(1, { message: 'La quantité doit être au moins 1' })
  quantite!: number;

  @IsOptional() @IsString() @MaxLength(255)
  motif?: string;
}

/** Une ligne de la facture générée : quantité validée ou réduite (0 = non servi). */
export class LigneFactureGenereeDto {
  @IsInt({ message: 'Choisissez le produit' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(0, { message: 'La quantité ne peut pas être négative' })
  quantite!: number;
}

/** Facture générée à partir d'un rapport validé. */
export class GenererFactureDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneFactureGenereeDto)
  lignes!: LigneFactureGenereeDto[];
}

/** Réouverture d'un rapport validé (administrateur). */
export class RouvrirRapportDto {
  @IsString({ message: 'Indiquez le motif de la réouverture' })
  @MaxLength(500)
  motif!: string;
}
