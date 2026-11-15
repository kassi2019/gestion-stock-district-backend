/** Données attendues pour créer ou modifier une FORME de médicament (ex. Comprimé, Sirop). */
import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreerFormeDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (FRM-0001...) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire' })
  @MaxLength(100)
  libelle!: string;
}

export class ModifierFormeDto extends PartialType(CreerFormeDto) {}
