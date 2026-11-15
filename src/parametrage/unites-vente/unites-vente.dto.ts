/** Données attendues pour créer ou modifier une UNITÉ DE VENTE (ex. Boîte, Plaque, Flacon). */
import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreerUniteVenteDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (UNV-0001...) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire' })
  @MaxLength(100)
  libelle!: string;
}

export class ModifierUniteVenteDto extends PartialType(CreerUniteVenteDto) {}
