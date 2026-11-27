-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Qui donne l'autorisation de diffuser, et qui choisit les langues du direct (étape 25, ADR 0056
-- amendée) : ce que Drizzle Kit n'émet pas.
--
-- La migration 0084 ajoute `membership.can_broadcast` (faux par défaut) et
-- `organization.live_language` (les sept langues du direct par défaut). Le rôle applicatif ne
-- modifie ces deux tables que colonne par colonne (migrations 0053 et 0083) : sans ce fichier, les
-- deux colonnes seraient écrites par personne.
--
-- Qui écrit ne change pas : les politiques `membership_update` et `organization_update` exigent
-- toujours une personne responsable (`jadwal.is_org_admin()`, migration 0059). Un éditeur ne se
-- donne donc pas l'autorisation, et n'en donne à personne. Le super-admin garde toute la ligne des
-- deux tables (ADR 0025) : entré dans l'organisation, il donne l'autorisation comme la personne
-- responsable.
--
-- Une porte restait : l'entrée. C'est l'invité qui crée sa propre adhésion en acceptant (ADR 0017),
-- et le rôle applicatif nomme toutes les colonnes à l'insertion ; il aurait pu y écrire
-- `can_broadcast = true`. La politique `membership_insert` exige désormais qu'elle reste fausse.
-- La migration 0084 l'a posée ; elle est redite ici parce que le rejeu de la migration 0058 la
-- recrée sans cette clause, et que celle-ci la rétablit juste après.
--
-- Au rejeu, les migrations 0053 et 0083 ramènent d'abord les droits à leurs colonnes, et celle-ci
-- les porte aux colonnes du direct juste après : l'ordre des fichiers suffit.

-- 1. Les droits. Le retrait d'abord : il emporte les droits de colonne, et l'accord repart de zéro.
REVOKE UPDATE ON "membership" FROM "jadwal_app";
--> statement-breakpoint
GRANT UPDATE ("role", "updated_at", "can_broadcast") ON "membership" TO "jadwal_app";
--> statement-breakpoint
REVOKE UPDATE ON "organization" FROM "jadwal_app";
--> statement-breakpoint
GRANT UPDATE ("name", "time_zone", "accent_color", "greeting", "enabled_language",
	"default_language", "prayer_module", "updated_at",
	"address", "contact_phone", "contact_email", "website", "access_note", "announcement",
	"live_language")
	ON "organization" TO "jadwal_app";
--> statement-breakpoint

-- 2. L'entrée ne donne pas l'autorisation.
ALTER POLICY "membership_insert" ON "membership" TO jadwal_app WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id())
				and "membership"."user_id" = (select jadwal.current_user_id())
				and jadwal.invited("membership"."organization_id", "membership"."user_id", "membership"."role")
				and "membership"."can_broadcast" = false);
--> statement-breakpoint

-- 3. La preuve, dans la même transaction. Elle dit l'état entier des colonnes que le rôle
--    applicatif écrit sur ces deux tables, et remplace sur ce point celles des migrations 0053 et
--    0083.
DO $verifie$
DECLARE
	m CONSTANT text := 'public.membership';
	o CONSTANT text := 'public.organization';
	colonnes_m CONSTANT text[] := ARRAY['role', 'updated_at', 'can_broadcast'];
	colonnes_o CONSTANT text[] := ARRAY['name', 'time_zone', 'accent_color', 'greeting',
		'enabled_language', 'default_language', 'prayer_module', 'updated_at',
		'address', 'contact_phone', 'contact_email', 'website', 'access_note', 'announcement',
		'live_language'];
	colonne text;
	role_name text;
BEGIN
	-- Les deux colonnes existent, obligatoires, avec leur défaut.
	IF NOT EXISTS (
		SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
		WHERE a.attrelid = m::regclass AND a.attname = 'can_broadcast' AND a.attnotnull
			AND a.atttypid = 'boolean'::regtype AND pg_get_expr(d.adbin, d.adrelid) = 'false'
	) THEN
		RAISE EXCEPTION 'membership.can_broadcast : manque, ou n''est pas un booléen obligatoire, faux par défaut';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_attribute
		WHERE attrelid = o::regclass AND attname = 'live_language' AND attnotnull
			AND atttypid = 'text[]'::regtype
	) THEN
		RAISE EXCEPTION 'organization.live_language : manque, ou n''est pas une liste obligatoire';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = o::regclass AND conname = 'organization_live_language_ck' AND contype = 'c'
			AND convalidated AND pg_get_constraintdef(oid) ~* 'IS\s+TRUE\s*\)*\s*$'
			AND pg_get_constraintdef(oid) LIKE '%''fr''%''de''%''it''%''en''%''sq''%''bs''%''tr''%'
	) THEN
		RAISE EXCEPTION 'organization_live_language_ck : manque, n''est pas validée, ou ne borne pas aux sept langues';
	END IF;

	-- Le rôle applicatif : ces colonnes, et aucune autre. Jamais toute la ligne.
	IF has_table_privilege('jadwal_app', m, 'UPDATE') OR has_table_privilege('jadwal_app', o, 'UPDATE') THEN
		RAISE EXCEPTION 'membership ou organization : jadwal_app modifie toute la ligne';
	END IF;
	FOR colonne IN
		SELECT attname FROM pg_attribute WHERE attrelid = m::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_app', m, colonne, 'UPDATE') <> (colonne = ANY (colonnes_m)) THEN
			RAISE EXCEPTION 'membership : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;
	FOR colonne IN
		SELECT attname FROM pg_attribute WHERE attrelid = o::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_app', o, colonne, 'UPDATE') <> (colonne = ANY (colonnes_o)) THEN
			RAISE EXCEPTION 'organization : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;

	-- Écrire reste réservé à une personne responsable, sur les deux tables.
	IF (SELECT count(*) FROM pg_policies
		WHERE schemaname = 'public' AND cmd = 'UPDATE' AND roles = ARRAY['jadwal_app']::name[]
			AND ((tablename = 'membership' AND policyname = 'membership_update')
				OR (tablename = 'organization' AND policyname = 'organization_update'))
			AND qual LIKE '%is_org_admin()%' AND with_check LIKE '%is_org_admin()%') <> 2 THEN
		RAISE EXCEPTION 'membership_update ou organization_update : n''exige plus une personne responsable';
	END IF;

	-- L'entrée : toujours sur invitation, du rôle de l'invitation, et sans l'autorisation.
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'membership' AND policyname = 'membership_insert'
			AND roles = ARRAY['jadwal_app']::name[] AND cmd = 'INSERT'
			AND with_check LIKE '%jadwal.invited(organization_id, user_id, role)%'
			AND with_check LIKE '%can_broadcast = false%'
	) THEN
		RAISE EXCEPTION 'membership_insert : doit passer par jadwal.invited et laisser can_broadcast faux';
	END IF;

	-- Le super-admin garde toute la ligne des deux tables (ADR 0025).
	IF NOT (has_table_privilege('jadwal_superadmin', m, 'UPDATE')
		AND has_table_privilege('jadwal_superadmin', o, 'UPDATE')) THEN
		RAISE EXCEPTION 'membership ou organization : le super-admin a perdu la modification';
	END IF;

	-- Le rôle public et celui de la connexion n'écrivent ni l'une ni l'autre.
	FOREACH role_name IN ARRAY ARRAY['jadwal_public', 'jadwal_auth', 'public'] LOOP
		IF has_any_column_privilege(role_name, m, 'INSERT, UPDATE')
			OR has_any_column_privilege(role_name, o, 'INSERT, UPDATE') THEN
			RAISE EXCEPTION 'membership ou organization : % y écrit', role_name;
		END IF;
	END LOOP;
END
$verifie$;
