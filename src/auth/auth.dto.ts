/**
 * DTO = "Data Transfer Object" : décrit les données attendues par une route.
 *
 * Les étiquettes @IsString(), @IsNotEmpty() vérifient automatiquement les
 * données reçues. Si elles sont incorrectes, l'API répond une erreur 400
 * avec un message, sans même entrer dans le service.
 */
import { IsNotEmpty, IsString } from 'class-validator';

/** Données envoyées par l'écran de connexion. */
export class ConnexionDto {
  @IsString()
  @IsNotEmpty({ message: "L'identifiant est obligatoire" })
  login!: string;

  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  motDePasse!: string;
}
