-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le super-admin répond aux demandes d'accès (étape 22, ADR 0049) : ce que Drizzle Kit n'émet pas.
--
-- La migration 0080 pose la politique : une demande qui attend, lue depuis la console, sans
-- organisation en contexte, devient acceptée ou refusée, datée de l'heure de la transaction qui
-- répond. Celle-ci donne les deux colonnes que la réponse écrit, et rien d'autre : le super-admin ne
-- réécrit pas ce que la demande dit, n'en crée aucune et n'en efface aucune. La purge s'en charge
-- (migration 0079).
--
-- Accepter se fait dans la transaction qui crée l'organisation : la demande d'abord, sans contexte,
-- puis le contexte de l'organisation nouvelle. Une demande qui n'attend plus ne change pas, et
-- l'écran annule la création.

-- 1. Les droits. Le retrait d'abord, pour que le fichier se rejoue tel quel.
REVOKE UPDATE ON "access_request" FROM "jadwal_superadmin";
--> statement-breakpoint
GRANT UPDATE ("status", "resolved_at") ON "access_request" TO "jadwal_superadmin";
--> statement-breakpoint

-- 2. La preuve, dans la même transaction. Elle dit l'état entier de la table, et remplace celle de
--    la migration 0079, qui disait « lit, et seulement lit ».
DO $verifie$
DECLARE
	t CONSTANT text := 'public.access_request';
	role_name text;
	attendues text;
	trouvees text;
	purge text;
	colonne text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_class
		WHERE oid = t::regclass AND relrowsecurity AND relforcerowsecurity
	) THEN
		RAISE EXCEPTION 'access_request : sécurité au niveau des lignes non forcée';
	END IF;

	-- Le super-admin lit, et répond : l'état et la date de réponse, et aucune autre colonne.
	IF NOT has_table_privilege('jadwal_superadmin', t, 'SELECT')
		OR has_table_privilege('jadwal_superadmin', t, 'UPDATE')
		OR has_any_column_privilege('jadwal_superadmin', t, 'INSERT, REFERENCES')
		OR has_table_privilege('jadwal_superadmin', t, 'DELETE, TRUNCATE, TRIGGER') THEN
		RAISE EXCEPTION 'access_request : jadwal_superadmin doit lire et répondre, rien de plus';
	END IF;
	FOR colonne IN
		SELECT attname FROM pg_attribute WHERE attrelid = t::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_superadmin', t, colonne, 'UPDATE')
			<> (colonne IN ('status', 'resolved_at')) THEN
			RAISE EXCEPTION 'access_request : jadwal_superadmin écrit l''état et la date de réponse, et elles seules (%)',
				colonne;
		END IF;
	END LOOP;

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
		|| 'access_request_superadmin_resolve UPDATE {jadwal_superadmin};'
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

	-- La réponse : une demande qui attend, depuis la console ; acceptée ou refusée, à l'heure de la
	-- transaction. Les deux expressions entières, telles que PostgreSQL les rend.
	IF (
		SELECT coalesce(qual, '') || ' / ' || coalesce(with_check, '') FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'access_request'
			AND policyname = 'access_request_superadmin_resolve'
	) <> '((status = ''pending''::text) AND (( SELECT COALESCE(current_setting(''jadwal.org_id''::text, true), ''''::text) AS "coalesce") = ''''::text))'
		|| ' / ((status = ANY (ARRAY[''accepted''::text, ''refused''::text])) AND (resolved_at = now()))' THEN
		RAISE EXCEPTION 'access_request_superadmin_resolve : la réponse n''est plus celle annoncée';
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
