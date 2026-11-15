/**
 * Données attendues pour les PROFILS (rôles) et leurs droits par module.
 *
 * permissions : { "parametrage": ["VOIR", "IMPRIMER", "MODIFIER"], "stock": ["VOIR"] }
 *   - un module absent (ou liste vide) = aucun accès ;
 *   - IMPRIMER ou MODIFIER entraîne VOIR ;
 *   - les codes de modules et droits sont vérifiés dans roles.service.ts.
 */
import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreerRoleDto {
  /** Code en MAJUSCULES, sans espace (ex. « PHARMACIEN ») */
  @IsString()
  @IsNotEmpty({ message: 'Le code est obligatoire' })
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Le code ne doit contenir que des MAJUSCULES, chiffres et _ (ex. PHARMACIEN)' })
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire' })
  @MaxLength(100)
  libelle!: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;

  /** Droits par module (voir en haut du fichier) */
  @IsOptional() @IsObject({ message: 'Les droits doivent être une liste module -> niveau' })
  permissions?: Record<string, string[]>;
}

export class ModifierRoleDto extends PartialType(CreerRoleDto) {}
