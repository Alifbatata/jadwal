-- Better Auth se sert de `verification` comme table de verrous, avec une **clé primaire déterminée
-- par un SHA-256** (« premier écrivain gagne »). Quarante-trois caractères en base64url n'entrent
-- pas dans une colonne `uuid` : la connexion échouait avec un code 500 pour tout compte dont
-- l'adresse n'avait pas encore été prouvée — dont celui du super-admin, que la procédure d'amorçage
-- crée exactement ainsi. Mesuré sur la base de démonstration, pas deviné.
ALTER TABLE "verification" ALTER COLUMN "id" SET DATA TYPE text;