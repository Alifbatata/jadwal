-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le verrou de conservation (ADR 0030) : ce que Drizzle Kit n'émet pas.
--
-- Trois idées, et la troisième est celle qui fait la garantie :
-- 1. personne d'autre que le propriétaire ne touche à cette table : ni le rôle applicatif, ni le
--    super-admin, ni le rôle de connexion, ni le rôle public. Le refus tombe sur un droit absent,
--    avant qu'une ligne soit examinée ;
-- 2. poser et lever un verrou sont des gestes d'entretien, sous le drapeau de l'ADR 0019. La
--    **lecture**, elle, est toujours ouverte au propriétaire : les politiques de purge la font, et
--    elles ne posent aucun drapeau ;
-- 3. la fenêtre de rétention reste portée par une politique de suppression, et c'est la politique
--    qui consulte le verrou. Une procédure de purge réécrite de travers, ou appelée par erreur, ne
--    peut toujours rien emporter : la base refuse ligne par ligne.

ALTER TABLE "retention_hold" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "retention_hold" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "retention_hold" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON "retention_hold" FROM "jadwal_app";
--> statement-breakpoint
REVOKE ALL ON "retention_hold" FROM "jadwal_superadmin";
--> statement-breakpoint
REVOKE ALL ON "retention_hold" FROM "jadwal_auth";
--> statement-breakpoint
REVOKE ALL ON "retention_hold" FROM "jadwal_public";
--> statement-breakpoint

-- La lecture est ouverte au propriétaire sans drapeau : les politiques de purge ci-dessous la font
-- au milieu d'un `delete`, et un drapeau y serait à la fois inutile et piégeux — la purge du
-- journal d'audit, elle, ne pose aucun drapeau.
DROP POLICY IF EXISTS "retention_hold_owner_select" ON "retention_hold";
--> statement-breakpoint
CREATE POLICY "retention_hold_owner_select" ON "retention_hold"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "retention_hold_owner_insert" ON "retention_hold";
--> statement-breakpoint
CREATE POLICY "retention_hold_owner_insert" ON "retention_hold"
	AS PERMISSIVE FOR INSERT TO "jadwal_owner" WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "retention_hold_owner_update" ON "retention_hold";
--> statement-breakpoint
CREATE POLICY "retention_hold_owner_update" ON "retention_hold"
	AS PERMISSIVE FOR UPDATE TO "jadwal_owner"
	USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "retention_hold_owner_delete" ON "retention_hold";
--> statement-breakpoint
CREATE POLICY "retention_hold_owner_delete" ON "retention_hold"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint

-- La purge du journal d'audit, bornée comme avant à vingt-quatre mois, et suspendue tant qu'un
-- verrou est posé sur l'organisation de la ligne.
DROP POLICY IF EXISTS "audit_log_owner_purge" ON "audit_log";
--> statement-breakpoint
CREATE POLICY "audit_log_owner_purge" ON "audit_log"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING (
		"created_at" < now() - interval '24 months'
		AND NOT EXISTS (
			SELECT 1 FROM public."retention_hold" h
			WHERE h."organization_id" = "audit_log"."organization_id"
		)
	);
--> statement-breakpoint

-- Le registre interne du super-admin, même règle. Sa colonne d'organisation n'a pas de clé
-- étrangère et peut être absente (ADR 0025) : une entrée sans organisation n'est couverte par aucun
-- verrou, et c'est exact — elle ne décrit la consultation d'aucune organisation.
DROP POLICY IF EXISTS "admin_access_log_owner_purge" ON "admin_access_log";
--> statement-breakpoint
CREATE POLICY "admin_access_log_owner_purge" ON "admin_access_log"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING (
		"created_at" < now() - interval '24 months'
		AND NOT EXISTS (
			SELECT 1 FROM public."retention_hold" h
			WHERE h."organization_id" = "admin_access_log"."organization_id"
		)
	);
