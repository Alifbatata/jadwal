-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le super-admin supprime un compte (étape 25, ADR 0058 amendée).
--
-- Le chef de projet l'a dit le 28 novembre 2026 : « le super admin doit pouvoir tout faire ». Son
-- rôle n'a pourtant aucun droit de suppression sur les comptes, et n'en reçoit pas : une écriture
-- large serait un écran oublié de plus qui peut tout effacer. La suppression passe par une
-- fonction, qui ne supprime qu'un compte à la fois, désigné par son identifiant, et dit ce qui
-- s'est passé :
--
--   `deleted`        le compte est supprimé, avec ce qui tombe avec lui par les clés étrangères :
--                    sessions, passkeys, comptes de connexion et adhésions (donc les acceptations
--                    des conditions). Ce qu'il a signé reste, sans son nom (`set null`) ;
--   `gone`           aucun compte ne porte cet identifiant ;
--   `super_admin`    un compte de l'exploitant ne se supprime pas d'un écran : il ne s'ouvre pas
--                    non plus d'un écran (étape 11) ;
--   `last_org_admin` le compte est la dernière personne responsable d'une organisation. Rien n'est
--                    supprimé : une organisation garde toujours au moins une personne responsable
--                    (migration 0012). Le super-admin en nomme une autre, ou supprime
--                    l'organisation, puis revient.
--
-- Le déclencheur de la dernière personne responsable reste le dernier rempart : si une autre
-- transaction retire entre-temps l'autre responsable, il refuse la cascade, et la fonction échoue.
--
-- `SECURITY DEFINER` : elle écrit sous le propriétaire, avec les précautions de `may_sign_in`
-- (migration 0077) : chemin de recherche figé, `pg_temp` en dernier, droit d'exécution retiré à tous
-- puis donné au seul rôle du super-admin. Le propriétaire ne lit et n'efface que sous son drapeau
-- d'entretien : la fonction le lève le temps du geste, puis le remet comme elle l'a trouvé. Le
-- journal de chaque organisation touchée, l'application l'écrit dans la même transaction.
CREATE OR REPLACE FUNCTION "jadwal"."delete_account"(p_user uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
	avant text := coalesce(current_setting('jadwal.maintenance', true), '');
	exploitant boolean;
	issue text;
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	SELECT u."is_super_admin" INTO exploitant FROM public."user" u WHERE u."id" = p_user;
	IF NOT FOUND THEN
		issue := 'gone';
	ELSIF exploitant THEN
		issue := 'super_admin';
	ELSIF EXISTS (
		SELECT 1 FROM public."membership" m
		WHERE m."user_id" = p_user AND m."role" = 'org_admin'
			AND NOT EXISTS (
				SELECT 1 FROM public."membership" autre
				WHERE autre."organization_id" = m."organization_id"
					AND autre."role" = 'org_admin' AND autre."user_id" <> p_user
			)
	) THEN
		issue := 'last_org_admin';
	ELSE
		DELETE FROM public."user" WHERE "id" = p_user;
		issue := 'deleted';
	END IF;
	PERFORM set_config('jadwal.maintenance', avant, true);
	RETURN issue;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."delete_account"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."delete_account"(uuid) TO "jadwal_superadmin";
--> statement-breakpoint

-- La preuve, dans la même transaction : seul le rôle du super-admin appelle la fonction.
DO $verifie$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_roles r
		WHERE r.rolname IN ('jadwal_app', 'jadwal_auth', 'jadwal_public')
			AND has_function_privilege(r.oid, 'jadwal.delete_account(uuid)', 'EXECUTE')
	) THEN
		RAISE EXCEPTION 'jadwal.delete_account : un autre rôle que celui du super-admin peut l''appeler';
	END IF;
	IF NOT has_function_privilege('jadwal_superadmin', 'jadwal.delete_account(uuid)', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.delete_account : le rôle du super-admin ne peut pas l''appeler';
	END IF;
END
$verifie$;
