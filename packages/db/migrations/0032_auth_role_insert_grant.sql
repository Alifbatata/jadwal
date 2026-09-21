-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Suite de la revue d'évasion : la correction 3 de la migration 0029 fermait trop, et par le mauvais
-- outil.
--
-- Elle retirait au rôle de connexion le droit d'insertion sur la colonne `is_super_admin`. Mais
-- Drizzle nomme **toutes** les colonnes de la table dans son ordre d'insertion, même celles qu'il
-- laisse à leur valeur par défaut, et PostgreSQL exige le droit sur chaque colonne nommée : créer un
-- compte échouait donc sur `permission denied for table user`, et plus personne ne pouvait se
-- connecter pour la première fois. Mesuré par les tests d'accès, pas deviné.
--
-- Le droit revient donc, et c'est une politique qui porte l'interdit : le rôle de connexion crée des
-- comptes, jamais un compte super-admin (`user_auth_insert`, migration 0031). Un droit dit quelles
-- colonnes on peut nommer, et seule une politique peut dire quelle valeur on y met.
GRANT INSERT ("id", "email", "name", "email_verified", "image", "is_super_admin", "created_at", "updated_at")
	ON "user" TO "jadwal_auth";
