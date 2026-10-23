-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Un lien de connexion ne part qu'à une adresse attendue (étape 22, ADR 0049).
--
-- Jusqu'ici, `/connexion` envoyait un lien à toute adresse de forme acceptable, et son ouverture
-- créait un compte rattaché à rien. Le chef de projet a décidé, le 20.10.2026, que c'est le
-- super-admin qui donne l'accès : la création de compte est fermée aux adresses que personne n'a
-- invitées. Une adresse est attendue quand un compte la porte, ou quand une invitation en attente et
-- non échue l'attend. Pour toute autre, l'application envoie un autre courriel, qui dit comment
-- demander l'accès ; l'écran, lui, répond la même chose dans les deux cas (ADR 0017).
--
-- La réponse vient d'une fonction, et non d'une lecture par le rôle de connexion : il lit déjà les
-- comptes, mais aucune invitation, et il n'a pas à en lire. La fonction rend oui ou non, rien
-- d'autre ; ni l'organisation, ni le rôle, ni la date ne sortent.
--
-- `SECURITY DEFINER` : elle lit sous le propriétaire, avec les précautions de `count_view`
-- (migration 0045) : chemin de recherche figé, `pg_temp` en dernier, droit d'exécution retiré à
-- tous puis donné au seul rôle de connexion. Les invitations, le propriétaire les lit sans
-- condition (`invitation_owner_read`, migration 0024) ; les comptes, sous son drapeau d'entretien
-- seulement : la fonction le lève le temps de la lecture, puis le remet comme elle l'a trouvé. Le
-- drapeau ne donne rien au rôle de connexion, dont aucune politique ne le lit.
--
-- L'échéance est celle de l'acceptation et de `purge_orphan_accounts` : `expires_at > now()`. Une
-- invitation échue, annulée ou consommée n'ouvre plus rien. Une invitation acceptée a déjà son
-- compte. La comparaison ignore la casse et les espaces autour, comme le limiteur par adresse.
--
-- Volatile, parce qu'elle lève un drapeau. Aucune politique ne l'appelle.
CREATE OR REPLACE FUNCTION "jadwal"."may_sign_in"(p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
	avant text := coalesce(current_setting('jadwal.maintenance', true), '');
	adresse text := lower(btrim(coalesce(p_email, '')));
	attendue boolean;
BEGIN
	IF adresse = '' THEN
		RETURN false;
	END IF;
	PERFORM set_config('jadwal.maintenance', 'on', true);
	attendue := EXISTS (SELECT 1 FROM public."user" u WHERE lower(u."email") = adresse)
		OR EXISTS (
			SELECT 1 FROM public."invitation" i
			WHERE lower(i."email") = adresse
				AND i."status" = 'pending'
				AND i."expires_at" > now()
		);
	PERFORM set_config('jadwal.maintenance', avant, true);
	RETURN attendue;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."may_sign_in"(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."may_sign_in"(text) TO "jadwal_auth";
--> statement-breakpoint

-- La preuve, dans la même transaction : seul le rôle de connexion appelle la fonction.
DO $verifie$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_roles r
		WHERE r.rolname IN ('jadwal_app', 'jadwal_superadmin', 'jadwal_public')
			AND has_function_privilege(r.oid, 'jadwal.may_sign_in(text)', 'EXECUTE')
	) THEN
		RAISE EXCEPTION 'jadwal.may_sign_in : un autre rôle que celui de connexion peut l''appeler';
	END IF;
	IF NOT has_function_privilege('jadwal_auth', 'jadwal.may_sign_in(text)', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.may_sign_in : le rôle de connexion ne peut pas l''appeler';
	END IF;
END
$verifie$;
