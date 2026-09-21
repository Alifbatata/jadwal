-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- On ne rejoint une organisation que si elle vous a invité (ADR 0017).
--
-- L'étape 3 rend l'écriture d'adhésion au rôle applicatif sous la forme « on ne s'attache que
-- soi-même », ce qui ferme l'évasion de l'étape 2. Il reste une règle d'intégrité : s'attacher
-- soi-même à n'importe quelle organisation. On la confie à la base aussi.
--
-- La difficulté est la récursion. Vue par le rôle applicatif, la politique de lecture d'`invitation`
-- consulte `user`, dont la politique consulte `membership` : une politique de `membership` qui
-- lirait `invitation` boucle, et PostgreSQL la refuse. D'où une fonction à droits du définisseur,
-- dont la requête est évaluée sous le propriétaire, avec une politique de lecture qui ne consulte
-- rien d'autre. La chaîne s'arrête là.

DROP POLICY IF EXISTS "invitation_owner_read" ON "invitation";
--> statement-breakpoint
-- Lecture inconditionnelle du propriétaire sur les seules invitations : elle ne sert qu'à la
-- fonction ci-dessous. Le propriétaire ne gagne rien d'autre, ses autres politiques restant sous
-- son drapeau d'entretien.
CREATE POLICY "invitation_owner_read" ON "invitation"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (true);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."invited"(organisation uuid, personne uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
	SELECT EXISTS (
		SELECT 1 FROM public."invitation" i
		JOIN public."user" u ON lower(u."email") = lower(i."email")
		WHERE i."organization_id" = organisation
			AND i."status" = 'pending'
			AND i."expires_at" > now()
			AND u."id" = personne
	)
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."invited"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."invited"(uuid, uuid) TO "jadwal_app";
--> statement-breakpoint
DROP POLICY IF EXISTS "membership_insert" ON "membership";
--> statement-breakpoint
CREATE POLICY "membership_insert" ON "membership"
	AS PERMISSIVE FOR INSERT TO "jadwal_app"
	WITH CHECK (
		"organization_id" = (select jadwal.current_org_id())
		AND "user_id" = (select jadwal.current_user_id())
		AND jadwal.invited("organization_id", "user_id")
	);
