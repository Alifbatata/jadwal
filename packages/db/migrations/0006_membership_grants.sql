-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Les écritures d'adhésion quittent le rôle applicatif (ADR 0013). Écrit à la main : Drizzle Kit
-- n'émet pas les droits. Rejouable telle quelle.
--
-- Une organisation pouvait fabriquer une adhésion vers la personne d'une autre organisation — la
-- vérification de clé étrangère contourne toujours la sécurité au niveau des lignes — et cette
-- adhésion lui ouvrait ensuite la lecture de cette personne, puisque `user_select` accorde la
-- lecture aux membres de l'organisation courante. La garde employée ailleurs (« la personne
-- désignée doit être déjà visible ») est impossible ici : `user_select` lit `membership`, donc une
-- politique de `membership` qui lit `user` forme une récursion que PostgreSQL refuse.
REVOKE INSERT, UPDATE ON "membership" FROM "jadwal_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "membership" TO "jadwal_superadmin";
