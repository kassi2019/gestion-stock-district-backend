/**
 * =============================================================================
 * DONNÉES ATTENDUES — INVENTAIRE INITIAL (spec nov. 2026, §2)
 * =============================================================================
 * Stock de départ d'UNE entité (le district OU un centre de santé), saisi une
 * seule fois à la mise en service. Les lignes envoyées REMPLACENT celles déjà
 * enregistrées pour cette entité.
 * =============================================================================
 */
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class LigneInventaireInitialDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  /** Quantité en stock (0 accepté : produit présent dans la liste mais épuisé) */
  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(0, { message: 'La quantité ne peut pas être négative' })
  quantite!: number;

  /** N° de lot — district seulement (obligatoire si le médicament est suivi par lot) */
  @IsOptional() @IsString() @MaxLength(50)
  numeroLot?: string;

  /** Date de péremption AAAA-MM-JJ — district seulement */
  @IsOptional() @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption?: string;
}

export class EnregistrerInventaireInitialDto {
  /** Date de mise en service (date de l'inventaire) */
  @IsDateString({}, { message: "La date de l'inventaire n'est pas valide" })
  dateInventaire!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneInventaireInitialDto)
  lignes!: LigneInventaireInitialDto[];
}
