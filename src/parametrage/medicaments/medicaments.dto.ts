/** Données attendues pour créer ou modifier un MÉDICAMENT du catalogue. */
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreerMedicamentDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (voir common/codes-auto.ts) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'La désignation est obligatoire' })
  @MaxLength(200)
  designation!: string;

  /** Forme (table formes_medicament : comprimé, sirop, injectable...) */
  @IsOptional() @IsInt()
  formeId?: number;

  /** Ex. "500 mg" */
  @IsOptional() @IsString() @MaxLength(50)
  dosage?: string;

  /**
   * Unité de dispensation (ex. "comprimé", "flacon") — sert pour toutes les quantités.
   * Facultative (plus dans le formulaire) : « unité » par défaut à la création.
   */
  @IsOptional() @IsString() @MaxLength(30)
  unite?: string;

  /** Ex. "Boîte de 100" */
  @IsOptional() @IsString() @MaxLength(100)
  conditionnement?: string;

  @IsOptional() @IsInt()
  familleId?: number;

  /** Stock minimum du dépôt : en dessous, une alerte est affichée */
  @IsOptional() @IsInt() @Min(0, { message: 'Le seuil ne peut pas être négatif' })
  seuilAlerte?: number;

  /** true = numéro de lot et date de péremption obligatoires à la réception */
  @IsOptional() @IsBoolean()
  suiviLot?: boolean;

  /** Consommable (coton, alcool...) : pas facturé en caisse pharmacie (montant = 0) */
  @IsOptional() @IsBoolean()
  consommable?: boolean;

  /**
   * Unité de vente (table unites_vente : Boîte, Plaque, Flacon...).
   * Le prix de vente s'applique à cette unité. Vide à la création = Boîte.
   */
  @IsOptional() @IsInt()
  uniteVenteId?: number;

  // ---------------------------------------------------------------------------
  // Champs qui ne sont PAS des colonnes du médicament (traités à part dans le service)
  // ---------------------------------------------------------------------------

  /**
   * Prix de vente général (FCFA). Enregistré dans l'historique des prix
   * (table prix_vente) à la date du jour. En modification : un nouveau prix
   * n'est créé que si le montant a changé.
   */
  @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Le prix de vente doit être un nombre' })
  @Min(0, { message: 'Le prix de vente ne peut pas être négatif' })
  prixVente?: number;

  /**
   * Prix d'achat (FCFA), payé au fournisseur (voir fournisseurId).
   * Enregistré dans l'historique des prix d'achat (table prix_achat), comme
   * le prix de vente : nouveau prix seulement si le montant a changé.
   */
  @IsOptional() @Type(() => Number) @IsNumber({}, { message: "Le prix d'achat doit être un nombre" })
  @Min(0, { message: "Le prix d'achat ne peut pas être négatif" })
  prixAchat?: number;

  /**
   * Fournisseur du prix d'achat (facultatif). Vide = prix d'achat valable
   * pour TOUS les fournisseurs ; rempli = prix propre à ce fournisseur.
   */
  @IsOptional() @IsInt()
  fournisseurId?: number;

  /** Stock initial au dépôt (seulement à la CRÉATION du médicament). */
  @IsOptional() @IsInt() @Min(0, { message: 'Le stock ne peut pas être négatif' })
  stockInitial?: number;

  /** N° de lot du stock initial (obligatoire si suivi par lot et stock > 0). */
  @IsOptional() @IsString() @MaxLength(50)
  numeroLot?: string;

  /** Date de péremption du stock initial, format AAAA-MM-JJ. */
  @IsOptional() @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption?: string;
}

/** Modification : tous les champs facultatifs, + activer/désactiver. */
export class ModifierMedicamentDto extends PartialType(CreerMedicamentDto) {
  @IsOptional() @IsBoolean()
  actif?: boolean;
}
