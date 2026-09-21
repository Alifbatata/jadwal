-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Durcissement : ce que Drizzle Kit n'émet pas (ADR 0013).
-- 1. La sécurité au niveau des lignes est forcée, pour qu'elle s'applique aussi au propriétaire des
--    tables. Sans cela, une migration ou une appartenance de rôle mal placée l'annulerait en
--    silence : la propriété se transmet par appartenance, l'attribut BYPASSRLS non.
-- 2. Les droits du rôle applicatif sont posés table par table. Le journal d'audit ne reçoit ni
--    UPDATE ni DELETE (ADR 0015) : sans droit, la tentative échoue avant même qu'une ligne soit
--    examinée, avec un message qui ne dépend pas du contenu.
-- Cette migration est rejouable telle quelle.

ALTER TABLE "organization" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "room" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "course" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "course_translation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session_exception" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pause" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prayer_day" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prayer_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Rôle applicatif : lecture et écriture sur les données d'organisation.
GRANT SELECT, INSERT, UPDATE, DELETE ON
	"membership", "room", "course", "course_translation", "session_exception", "pause",
	"prayer_day", "prayer_settings"
	TO "jadwal_app";
--> statement-breakpoint
-- L'organisation elle-même se lit et se modifie, mais ni se crée ni se supprime : c'est le
-- super-admin qui ouvre et ferme une organisation (ADR 0006).
GRANT SELECT, UPDATE ON "organization" TO "jadwal_app";
--> statement-breakpoint
-- L'annuaire des personnes est en lecture seule ici ; les comptes arrivent à l'étape 3.
GRANT SELECT ON "user" TO "jadwal_app";
--> statement-breakpoint
-- Journal d'audit : insertion et lecture, jamais de modification ni de suppression.
GRANT SELECT, INSERT ON "audit_log" TO "jadwal_app";
--> statement-breakpoint
-- Super-admin : ouvre et ferme les organisations, lit les personnes et le journal.
GRANT SELECT, INSERT, UPDATE, DELETE ON "organization" TO "jadwal_superadmin";
--> statement-breakpoint
GRANT SELECT ON "user", "audit_log" TO "jadwal_superadmin";
--> statement-breakpoint
-- Aucun droit sur les tables à venir n'est accordé par avance : chaque migration pose les siens.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM "jadwal_app";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM "jadwal_superadmin";
