-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Durcissement des tables de connexion et d'invitation (ADR 0016 et 0017). Drizzle Kit n'émet ni le
-- forçage de la RLS, ni les droits, ni rien qui touche aux rôles.
--
-- Le rôle `jadwal_auth` est le seul à toucher `session`, `account`, `verification` et `rate_limit`.
-- Le rôle applicatif n'y reçoit aucun droit : un jeton de session ou un secret ne lui est pas
-- seulement invisible, il lui est inaccessible, et la tentative échoue sur un refus de droit avant
-- que la moindre ligne soit examinée.

DO $auth$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtext('jadwal:roles'));
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jadwal_auth') THEN
		CREATE ROLE "jadwal_auth" NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
	END IF;
END
$auth$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "public", "jadwal" TO "jadwal_auth";
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verification" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "session", "account", "verification", "rate_limit"
	TO "jadwal_auth";
--> statement-breakpoint
-- Better Auth crée les comptes : c'est la seule écriture qu'il fait dans une table du métier.
GRANT SELECT, INSERT, UPDATE ON "user" TO "jadwal_auth";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "invitation" TO "jadwal_app";
--> statement-breakpoint
GRANT SELECT ON "invitation" TO "jadwal_superadmin";
