-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- La vue du super-admin sur les comptes de toutes les organisations (étape 25, ADR 0058).
--
-- L'inscription est ouverte à tous : le super-admin, qui gère toutes les mosquées et tous les
-- comptes, doit voir qui appartient à quelle organisation. Il lit déjà tous les comptes
-- (`user_superadmin_select`) et toutes les organisations, mais les adhésions de la seule
-- organisation où il est entré (`membership_superadmin_select`, migration 0033). Cette politique
-- ne change pas : élargie, elle ferait voir à l'écran Membres, s'il oubliait un jour son filtre,
-- les membres de toutes les organisations.
--
-- La liste sort donc par une fonction, pour le seul écran des comptes : elle rend, pour chaque
-- adhésion, le compte, l'organisation, le rôle et l'autorisation de diffuser, et rien d'autre ; ni
-- les dates, ni l'identifiant de l'adhésion.
--
-- `SECURITY DEFINER` : elle lit sous le propriétaire, avec les précautions de `may_sign_in`
-- (migration 0077) : chemin de recherche figé, `pg_temp` en dernier, droit d'exécution retiré à tous
-- puis donné au seul rôle du super-admin. Le propriétaire ne lit les adhésions que sous son drapeau
-- d'entretien : la fonction le lève le temps de la lecture, puis le remet comme elle l'a trouvé. Le
-- drapeau ne donne rien au rôle du super-admin, dont aucune politique ne le lit.
--
-- Volatile, parce qu'elle lève un drapeau. Aucune politique ne l'appelle.
CREATE OR REPLACE FUNCTION "jadwal"."all_memberships"()
RETURNS TABLE ("user_id" uuid, "organization_id" uuid, "role" text, "can_broadcast" boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
	avant text := coalesce(current_setting('jadwal.maintenance', true), '');
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	RETURN QUERY
		SELECT m."user_id", m."organization_id", m."role", m."can_broadcast"
		FROM public."membership" m
		ORDER BY m."user_id", m."organization_id";
	PERFORM set_config('jadwal.maintenance', avant, true);
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."all_memberships"() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."all_memberships"() TO "jadwal_superadmin";
--> statement-breakpoint

-- La preuve, dans la même transaction : seul le rôle du super-admin appelle la fonction.
DO $verifie$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_roles r
		WHERE r.rolname IN ('jadwal_app', 'jadwal_auth', 'jadwal_public')
			AND has_function_privilege(r.oid, 'jadwal.all_memberships()', 'EXECUTE')
	) THEN
		RAISE EXCEPTION 'jadwal.all_memberships : un autre rôle que celui du super-admin peut l''appeler';
	END IF;
	IF NOT has_function_privilege('jadwal_superadmin', 'jadwal.all_memberships()', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.all_memberships : le rôle du super-admin ne peut pas l''appeler';
	END IF;
END
$verifie$;
