-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Les demandes d'accès (migration 0078) : ce que Drizzle Kit n'émet pas (étape 22, ADR 0049).
--
-- Quatre idées :
-- 1. une seule écriture, `jadwal.request_access`, ouverte au seul rôle public. Le rôle public n'a
--    aucun droit sur la table : il ne relit ni la demande qu'il vient de déposer, ni celles des
--    autres, et un refus tombe sur un droit absent, avant qu'une ligne soit examinée ;
-- 2. une demande en attente au plus par adresse, et trente demandes au plus en vingt-quatre heures
--    pour tout le service : le formulaire ne doit pas servir à remplir la console ;
-- 3. le super-admin lit, depuis sa console (politique de la migration 0078). Accepter et refuser
--    viennent avec les écrans qui le font (chantier 6), et avec leurs droits ;
-- 4. une demande ne reste pas : résolue, elle part quatre-vingt-dix jours après sa réponse ; restée
--    sans réponse, douze mois après son dépôt. Une politique de suppression porte la durée, comme
--    pour le compteur de vues (migration 0043).

-- 1. Forçage. Drizzle sait activer, jamais forcer : sans `FORCE`, le propriétaire échapperait aux
--    politiques, et l'ADR 0019 ne vaudrait plus rien.
ALTER TABLE "access_request" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Les droits. Tout est retiré d'abord, à chaque rôle, puis le super-admin reçoit la lecture et
--    rien d'autre. Le retrait est indispensable : des droits par défaut peuvent avoir suivi la
--    création de la table.
REVOKE ALL ON "access_request" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON "access_request" FROM "jadwal_app";
--> statement-breakpoint
REVOKE ALL ON "access_request" FROM "jadwal_superadmin";
--> statement-breakpoint
REVOKE ALL ON "access_request" FROM "jadwal_auth";
--> statement-breakpoint
REVOKE ALL ON "access_request" FROM "jadwal_public";
--> statement-breakpoint
GRANT SELECT ON "access_request" TO "jadwal_superadmin";
--> statement-breakpoint

-- 3. Les politiques d'entretien du propriétaire (ADR 0019). La lecture reste ouverte sans drapeau,
--    comme sur le compteur de vues : la procédure de purge en a besoin pour voir ce qu'elle
--    supprime. Les écritures exigent le drapeau, que la fonction d'écriture lève le temps d'insérer.
DROP POLICY IF EXISTS "access_request_owner_select" ON "access_request";
--> statement-breakpoint
CREATE POLICY "access_request_owner_select" ON "access_request"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "access_request_owner_insert" ON "access_request";
--> statement-breakpoint
CREATE POLICY "access_request_owner_insert" ON "access_request"
	AS PERMISSIVE FOR INSERT TO "jadwal_owner" WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "access_request_owner_update" ON "access_request";
--> statement-breakpoint
CREATE POLICY "access_request_owner_update" ON "access_request"
	AS PERMISSIVE FOR UPDATE TO "jadwal_owner"
	USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "access_request_owner_delete" ON "access_request";
--> statement-breakpoint
CREATE POLICY "access_request_owner_delete" ON "access_request"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint

-- 4. La durée de conservation. Une demande résolue sert à se souvenir de la réponse donnée, le
--    temps qu'une organisation revienne avec une question : quatre-vingt-dix jours. Une demande
--    restée sans réponse part au bout de douze mois : au-delà, elle ne dit plus rien d'utile, et
--    elle garde le nom et l'adresse d'une personne.
DROP POLICY IF EXISTS "access_request_owner_purge" ON "access_request";
--> statement-breakpoint
CREATE POLICY "access_request_owner_purge" ON "access_request"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING (
		("status" <> 'pending' AND "resolved_at" < now() - interval '90 days')
		OR ("status" = 'pending' AND "created_at" < now() - interval '12 months')
	);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."purge_access_requests"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."access_request";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_access_requests"() FROM PUBLIC;
--> statement-breakpoint

-- 5. L'écriture. Les précautions de `count_view` (migration 0045) : `SECURITY DEFINER`, chemin de
--    recherche figé avec `pg_temp` en dernier, droit d'exécution retiré à tous puis donné au seul
--    rôle public, drapeau d'entretien levé le temps d'écrire et remis comme il était.
--
--    Elle rend une issue, et rien de la table :
--      `recorded`  : la demande est enregistrée ;
--      `duplicate` : une demande attend déjà pour cette adresse, casse ignorée ; rien n'est écrit.
--                    L'écran répond comme pour `recorded` : il ne dit pas qu'une adresse a déjà
--                    demandé (ADR 0017) ;
--      `full`      : trente demandes ont été déposées dans les dernières vingt-quatre heures ; rien
--                    n'est écrit, et l'écran demande de réessayer plus tard.
--
--    Les textes sont pris sans les blancs qui les entourent, et un message fait de blancs vaut
--    `null`. Le reste, forme de l'adresse, longueurs, langue, est refusé par les contraintes de la
--    table : le formulaire vérifie avant, et une saisie qui passerait outre lève.
--
--    Un verrou consultatif, le temps de la transaction, range les demandes simultanées l'une
--    derrière l'autre : sans lui, deux demandes pourraient lire vingt-neuf toutes les deux, et le
--    plafond deviendrait trente et une.
CREATE OR REPLACE FUNCTION "jadwal"."request_access"(
	p_organization_name text,
	p_locality text,
	p_contact_name text,
	p_email text,
	p_message text,
	p_language text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
	avant text := coalesce(current_setting('jadwal.maintenance', true), '');
	issue text;
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	PERFORM pg_advisory_xact_lock(hashtext('jadwal.request_access'));
	IF (
		SELECT count(*) FROM public."access_request"
		WHERE "created_at" > now() - interval '24 hours'
	) >= 30 THEN
		issue := 'full';
	ELSE
		INSERT INTO public."access_request" ("id", "organization_name", "locality",
			"contact_name", "email", "message", "language")
		VALUES (uuidv7(), btrim(p_organization_name), btrim(p_locality), btrim(p_contact_name),
			btrim(p_email), nullif(btrim(p_message), ''), p_language)
		ON CONFLICT (lower("email")) WHERE "status" = 'pending' DO NOTHING;
		issue := CASE WHEN FOUND THEN 'recorded' ELSE 'duplicate' END;
	END IF;
	PERFORM set_config('jadwal.maintenance', avant, true);
	RETURN issue;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."request_access"(text, text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."request_access"(text, text, text, text, text, text)
	TO "jadwal_public";
--> statement-breakpoint

-- 6. La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier
--    annonce, la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	t CONSTANT text := 'public.access_request';
	role_name text;
	attendues text;
	trouvees text;
	purge text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_class
		WHERE oid = t::regclass AND relrowsecurity AND relforcerowsecurity
	) THEN
		RAISE EXCEPTION 'access_request : sécurité au niveau des lignes non forcée';
	END IF;

	-- Le super-admin lit, et seulement lit.
	IF NOT has_table_privilege('jadwal_superadmin', t, 'SELECT')
		OR has_any_column_privilege('jadwal_superadmin', t, 'INSERT, UPDATE, REFERENCES')
		OR has_table_privilege('jadwal_superadmin', t, 'DELETE, TRUNCATE, TRIGGER') THEN
		RAISE EXCEPTION 'access_request : jadwal_superadmin doit lire, et seulement lire';
	END IF;

	-- Les autres rôles de connexion : rien du tout. Le rôle public écrit par la fonction seule.
	FOREACH role_name IN ARRAY ARRAY['jadwal_app', 'jadwal_auth', 'jadwal_public', 'public'] LOOP
		IF has_any_column_privilege(role_name, t, 'SELECT, INSERT, UPDATE, REFERENCES')
			OR has_table_privilege(role_name, t, 'DELETE, TRUNCATE, TRIGGER') THEN
			RAISE EXCEPTION 'access_request : % a un droit sur la table', role_name;
		END IF;
	END LOOP;

	-- Les politiques, toutes, par leur nom, leur commande et leurs rôles : une politique permissive
	-- de plus s'ajouterait aux autres et rouvrirait ce qu'elles ferment.
	attendues := 'access_request_owner_delete DELETE {jadwal_owner};'
		|| 'access_request_owner_insert INSERT {jadwal_owner};'
		|| 'access_request_owner_purge DELETE {jadwal_owner};'
		|| 'access_request_owner_select SELECT {jadwal_owner};'
		|| 'access_request_owner_update UPDATE {jadwal_owner};'
		|| 'access_request_superadmin_select SELECT {jadwal_superadmin}';
	SELECT string_agg(policyname || ' ' || cmd || ' ' || roles::text, ';' ORDER BY policyname)
	INTO trouvees
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'access_request';
	IF trouvees IS DISTINCT FROM attendues THEN
		RAISE EXCEPTION 'access_request : les politiques ne sont pas celles annoncées (%)', trouvees;
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'access_request' AND permissive <> 'PERMISSIVE'
	) THEN
		RAISE EXCEPTION 'access_request : une politique restrictive est apparue';
	END IF;

	-- La lecture du super-admin : sans organisation en contexte, et rien d'autre.
	IF (
		SELECT coalesce(qual, '') FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'access_request'
			AND policyname = 'access_request_superadmin_select'
	) <> '(( SELECT COALESCE(current_setting(''jadwal.org_id''::text, true), ''''::text) AS "coalesce") = ''''::text)' THEN
		RAISE EXCEPTION 'access_request_superadmin_select : ne se borne plus à la console';
	END IF;

	-- La durée de conservation, l'expression entière, telle que PostgreSQL la rend.
	SELECT coalesce(qual, '') INTO purge FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'access_request'
		AND policyname = 'access_request_owner_purge';
	IF purge <> '(((status <> ''pending''::text) AND (resolved_at < (now() - ''90 days''::interval)))'
		|| ' OR ((status = ''pending''::text) AND (created_at < (now() - ''1 year''::interval))))' THEN
		RAISE EXCEPTION 'access_request_owner_purge : la durée n''est plus celle annoncée (%)', purge;
	END IF;

	-- L'écriture : au rôle public, et à lui seul.
	IF NOT has_function_privilege('jadwal_public',
		'jadwal.request_access(text, text, text, text, text, text)', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.request_access : le rôle public ne peut pas l''appeler';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_roles r
		WHERE r.rolname IN ('jadwal_app', 'jadwal_superadmin', 'jadwal_auth')
			AND has_function_privilege(r.oid,
				'jadwal.request_access(text, text, text, text, text, text)', 'EXECUTE')
	) THEN
		RAISE EXCEPTION 'jadwal.request_access : un autre rôle que le rôle public peut l''appeler';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_roles r
		WHERE r.rolname IN ('jadwal_app', 'jadwal_superadmin', 'jadwal_auth', 'jadwal_public')
			AND has_function_privilege(r.oid, 'jadwal.purge_access_requests()', 'EXECUTE')
	) THEN
		RAISE EXCEPTION 'jadwal.purge_access_requests : un rôle de connexion peut l''appeler';
	END IF;
END
$verifie$;
