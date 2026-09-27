-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le super-admin signe le journal de sa propre identité (étape 19, lot 2, ADR 0025 et 0046).
--
-- La migration 0063 a exigé du rôle applicatif que l'auteur d'une entrée soit la personne du
-- contexte. Elle laissait la politique d'insertion du super-admin (`audit_log_superadmin_insert`,
-- migration 0027, bornée à l'organisation du contexte par la migration 0033) telle quelle : il
-- écrivait au journal d'une organisation une entrée qui nommait une personne responsable, une
-- éditrice, ou personne. L'organisation y lisait alors un geste qu'aucun de ses membres n'avait fait.
--
-- L'ADR 0025 dit que ses écritures y entrent « avec son identité » ; l'application le fait déjà :
-- `withSessionOrg` pose sa personne dans le contexte comme pour tout le monde, et `record` signe de
-- cette personne. La politique exige maintenant la même chose que celle du rôle applicatif :
-- l'organisation du contexte, et l'auteur qui est la personne du contexte. Une entrée sans auteur, ou
-- écrite sans personne dans le contexte, est refusée : `current_user_id()` rend alors NULL, et la
-- comparaison aussi.
--
-- Comme les passages de statut d'une invitation (addendum de l'ADR 0025 du 2026-09-23), c'est une
-- règle d'intégrité, pas un pouvoir retiré : le journal dit qui a fait quoi (ADR 0015). La base ne
-- sait pas qui tient la connexion : la personne du contexte est celle que l'application pose, pour
-- le super-admin comme pour le rôle applicatif (`docs/SECURITE.md`, barrières 1 et 10).
--
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0071_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien.

ALTER POLICY "audit_log_superadmin_insert" ON "audit_log" TO jadwal_superadmin WITH CHECK ("audit_log"."organization_id" = (select jadwal.current_org_id()) and "audit_log"."actor_id" = (select jadwal.current_user_id()));
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	controle text;
BEGIN
	SELECT coalesce(with_check, '') INTO controle
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'audit_log'
		AND policyname = 'audit_log_superadmin_insert'
		AND cmd = 'INSERT' AND roles = ARRAY['jadwal_superadmin']::name[];
	IF controle IS NULL THEN
		RAISE EXCEPTION 'audit_log_superadmin_insert : manque, ou n''est plus au seul super-admin';
	END IF;
	IF controle NOT LIKE '%organization_id = ( SELECT %current_org_id()%'
		OR controle NOT LIKE '%actor_id = ( SELECT %current_user_id()%'
		OR controle LIKE '% OR %' THEN
		RAISE EXCEPTION 'audit_log_superadmin_insert : l''auteur doit être la personne du contexte (%)',
			controle;
	END IF;
	-- Les politiques permissives s'ajoutent l'une à l'autre : aucune autre ne rouvre l'insertion au
	-- super-admin ni au rôle applicatif, et chacune des deux exige l'auteur du contexte.
	IF EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'audit_log'
			AND ('jadwal_superadmin' = ANY (roles) OR 'jadwal_app' = ANY (roles))
			AND cmd IN ('INSERT', 'ALL')
			AND policyname NOT IN ('audit_log_superadmin_insert', 'audit_log_insert')
	) THEN
		RAISE EXCEPTION 'audit_log : une autre politique ouvre l''insertion au super-admin ou au rôle applicatif';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_insert'
			AND coalesce(with_check, '') LIKE '%actor_id = ( SELECT %current_user_id()%'
	) THEN
		RAISE EXCEPTION 'audit_log_insert : l''auteur n''est plus la personne du contexte';
	END IF;
	-- Le journal reste en ajout seul pour le super-admin (ADR 0015).
	IF EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'audit_log' AND 'jadwal_superadmin' = ANY (roles)
			AND cmd NOT IN ('SELECT', 'INSERT')
	) OR has_table_privilege('jadwal_superadmin', 'public.audit_log', 'UPDATE, DELETE, TRUNCATE') THEN
		RAISE EXCEPTION 'audit_log : le super-admin peut modifier ou supprimer';
	END IF;
END
$verifie$;
