-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- L'acceptation des conditions d'utilisation (migration 0051) : ce que Drizzle Kit n'émet pas.
--
-- Trois idées :
-- 1. insertion seule pour tous les rôles de connexion, comme le journal d'audit (ADR 0015). Aucun
--    droit de modification ni de suppression : le refus tombe sur un droit absent, avant qu'une
--    ligne soit examinée, et il ne dit rien de ce qui existe ;
-- 2. le moment appartient au serveur, par le procédé du journal (ADR 0020) : l'insertion est
--    accordée colonne par colonne, sans `accepted_at`. Nommer la colonne est refusé, quelle que soit
--    la valeur, `default` compris ;
-- 3. rien ne s'efface à la main : la ligne part avec l'adhésion, par la clé étrangère en cascade.
--    PostgreSQL exécute une cascade sous l'identité du propriétaire de la table et hors des
--    politiques : elle passe sans qu'aucun rôle de connexion ait le droit de supprimer ici.

-- 1. Forçage. Drizzle sait activer, jamais forcer : sans `FORCE`, le propriétaire échapperait aux
--    politiques, et l'ADR 0019 ne vaudrait plus rien.
ALTER TABLE "terms_acceptance" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Les droits, à la mesure des politiques. Tout est retiré d'abord, puis accordé, et le retrait
--    est indispensable au rejeu : la boucle de la migration 0034 accorde au super-admin les quatre
--    opérations sur toute table qui porte `organization_id`. Sans ce retrait, le rejeu lui rendrait
--    trois droits sans politique, ce que le catalogue refuse. Retirer un droit de table retire aussi
--    les droits de colonne correspondants : l'insertion colonne par colonne repart de zéro.
REVOKE ALL ON "terms_acceptance" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON "terms_acceptance" FROM "jadwal_app";
--> statement-breakpoint
REVOKE ALL ON "terms_acceptance" FROM "jadwal_superadmin";
--> statement-breakpoint
REVOKE ALL ON "terms_acceptance" FROM "jadwal_auth";
--> statement-breakpoint
REVOKE ALL ON "terms_acceptance" FROM "jadwal_public";
--> statement-breakpoint
-- La personne lit et ajoute ses propres acceptations ; les politiques de la migration 0051 disent
-- lesquelles. `accepted_at` n'est pas dans la liste : il garde son défaut serveur.
GRANT SELECT ON "terms_acceptance" TO "jadwal_app";
--> statement-breakpoint
GRANT INSERT ("id", "organization_id", "user_id", "version") ON "terms_acceptance" TO "jadwal_app";
--> statement-breakpoint
-- Le super-admin lit, dans l'organisation où il est entré, et rien de plus : il n'accepte pas à la
-- place de quelqu'un.
GRANT SELECT ON "terms_acceptance" TO "jadwal_superadmin";
--> statement-breakpoint

-- 3. Les politiques d'entretien du propriétaire (ADR 0019). Les boucles des migrations 0019 et 0034
--    ont tourné avant que la table existe : on les écrit ici. Les quatre opérations sous le drapeau
--    d'entretien, comme sur toute table qui n'est pas un journal. Retirer la modification et la
--    suppression au propriétaire ne protégerait rien : il possède la table et peut y insérer sous
--    son drapeau une ligne au moment de son choix. Au rejeu, la boucle de la migration 0007 recrée
--    les mêmes politiques à l'identique : les deux chemins donnent le même schéma.
DROP POLICY IF EXISTS "terms_acceptance_owner_select" ON "terms_acceptance";
--> statement-breakpoint
CREATE POLICY "terms_acceptance_owner_select" ON "terms_acceptance"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "terms_acceptance_owner_insert" ON "terms_acceptance";
--> statement-breakpoint
CREATE POLICY "terms_acceptance_owner_insert" ON "terms_acceptance"
	AS PERMISSIVE FOR INSERT TO "jadwal_owner" WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "terms_acceptance_owner_update" ON "terms_acceptance";
--> statement-breakpoint
CREATE POLICY "terms_acceptance_owner_update" ON "terms_acceptance"
	AS PERMISSIVE FOR UPDATE TO "jadwal_owner"
	USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "terms_acceptance_owner_delete" ON "terms_acceptance";
--> statement-breakpoint
CREATE POLICY "terms_acceptance_owner_delete" ON "terms_acceptance"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint

-- 4. La preuve, dans la même transaction. Un droit oublié ou de trop ne lève rien au moment où on
--    l'accorde : il se découvre à l'usage. Si l'état n'est pas exactement celui que ce fichier
--    annonce, la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	t CONSTANT text := 'public.terms_acceptance';
	colonne text;
	role_name text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_class
		WHERE oid = t::regclass AND relrowsecurity AND relforcerowsecurity
	) THEN
		RAISE EXCEPTION 'terms_acceptance : sécurité au niveau des lignes non forcée';
	END IF;

	-- Le rôle applicatif : lire, et insérer les quatre colonnes accordées.
	IF NOT has_table_privilege('jadwal_app', t, 'SELECT') THEN
		RAISE EXCEPTION 'terms_acceptance : jadwal_app ne peut pas lire';
	END IF;
	FOREACH colonne IN ARRAY ARRAY['id', 'organization_id', 'user_id', 'version'] LOOP
		IF NOT has_column_privilege('jadwal_app', t, colonne, 'INSERT') THEN
			RAISE EXCEPTION 'terms_acceptance : jadwal_app ne peut pas écrire %', colonne;
		END IF;
	END LOOP;
	IF has_column_privilege('jadwal_app', t, 'accepted_at', 'INSERT') THEN
		RAISE EXCEPTION 'terms_acceptance : jadwal_app peut choisir accepted_at';
	END IF;
	IF has_any_column_privilege('jadwal_app', t, 'UPDATE')
		OR has_table_privilege('jadwal_app', t, 'DELETE, TRUNCATE') THEN
		RAISE EXCEPTION 'terms_acceptance : jadwal_app peut modifier ou supprimer';
	END IF;

	-- Le super-admin : lire, rien d'autre.
	IF NOT has_table_privilege('jadwal_superadmin', t, 'SELECT')
		OR has_any_column_privilege('jadwal_superadmin', t, 'INSERT, UPDATE')
		OR has_table_privilege('jadwal_superadmin', t, 'DELETE, TRUNCATE') THEN
		RAISE EXCEPTION 'terms_acceptance : jadwal_superadmin doit lire, et seulement lire';
	END IF;

	-- Les autres : rien du tout.
	FOREACH role_name IN ARRAY ARRAY['jadwal_auth', 'jadwal_public', 'public'] LOOP
		IF has_any_column_privilege(role_name, t, 'SELECT, INSERT, UPDATE, REFERENCES')
			OR has_table_privilege(role_name, t, 'DELETE, TRUNCATE, TRIGGER') THEN
			RAISE EXCEPTION 'terms_acceptance : % a un droit', role_name;
		END IF;
	END LOOP;

	-- La cascade est le seul chemin d'effacement : elle doit viser l'adhésion, et supprimer.
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'terms_acceptance_membership_fk' AND conrelid = t::regclass
			AND confrelid = 'public.membership'::regclass AND confdeltype = 'c'
	) THEN
		RAISE EXCEPTION 'terms_acceptance : la clé vers membership ne supprime pas en cascade';
	END IF;
END
$verifie$;
