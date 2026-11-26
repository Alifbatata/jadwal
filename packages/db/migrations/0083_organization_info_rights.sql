-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- La personne responsable écrit ce que l'organisation dit d'elle (étape 24, ADR 0052) : ce que
-- Drizzle Kit n'émet pas.
--
-- La migration 0082 ajoute six colonnes à `organization` : `address`, `contact_phone`,
-- `contact_email`, `website`, `access_note` et `announcement`. Le rôle applicatif ne modifie
-- l'organisation que colonne par colonne depuis la migration 0059, qui en nommait huit, celles de
-- l'écran des réglages : sans ce fichier, les six nouvelles seraient lisibles par tous et écrites
-- par personne.
--
-- Qui écrit ne change pas : la politique `organization_update` exige toujours une personne
-- responsable (`jadwal.is_org_admin()`, migration 0059). Seules les colonnes s'ajoutent. L'adresse
-- publique, l'état et les dates restent hors de portée du rôle applicatif.
--
-- Qui lit ne change pas non plus : le rôle public lit la ligne entière d'une organisation active
-- (migration 0039). Ces six colonnes sont publiques par nature, c'est leur raison d'être.
--
-- Au rejeu, la migration 0059 ramène d'abord le droit à ses huit colonnes, et celle-ci le porte à
-- quatorze juste après : l'ordre des fichiers suffit, comme entre 0002 et 0059.

-- 1. Les droits. Le retrait d'abord : il emporte les droits de colonne, et l'accord repart de zéro.
REVOKE UPDATE ON "organization" FROM "jadwal_app";
--> statement-breakpoint
GRANT UPDATE ("name", "time_zone", "accent_color", "greeting", "enabled_language",
	"default_language", "prayer_module", "updated_at",
	"address", "contact_phone", "contact_email", "website", "access_note", "announcement")
	ON "organization" TO "jadwal_app";
--> statement-breakpoint

-- 2. La preuve, dans la même transaction. Elle dit l'état entier des colonnes que le rôle
--    applicatif écrit, et remplace sur ce point celle de la migration 0059.
DO $verifie$
DECLARE
	t CONSTANT text := 'public.organization';
	colonnes CONSTANT text[] := ARRAY['name', 'time_zone', 'accent_color', 'greeting',
		'enabled_language', 'default_language', 'prayer_module', 'updated_at',
		'address', 'contact_phone', 'contact_email', 'website', 'access_note', 'announcement'];
	informations CONSTANT text[] := ARRAY['address', 'contact_phone', 'contact_email', 'website',
		'access_note', 'announcement'];
	colonne text;
	role_name text;
BEGIN
	-- Les six colonnes existent, facultatives, et chacune a sa contrainte.
	FOREACH colonne IN ARRAY informations LOOP
		IF NOT EXISTS (
			SELECT 1 FROM pg_attribute
			WHERE attrelid = t::regclass AND attname = colonne AND NOT attisdropped AND NOT attnotnull
				AND atttypid = 'text'::regtype
		) THEN
			RAISE EXCEPTION 'organization.% : manque, ou n''est pas un texte facultatif', colonne;
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conrelid = t::regclass AND contype = 'c' AND convalidated
				AND conname = 'organization_' || colonne || '_ck'
		) THEN
			RAISE EXCEPTION 'organization.% : sa contrainte manque, ou n''est pas validée', colonne;
		END IF;
	END LOOP;

	-- Le rôle applicatif : ces quatorze colonnes, et aucune autre. Jamais toute la ligne.
	IF has_table_privilege('jadwal_app', t, 'UPDATE') THEN
		RAISE EXCEPTION 'organization : jadwal_app modifie toute la ligne';
	END IF;
	FOR colonne IN
		SELECT attname FROM pg_attribute WHERE attrelid = t::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_app', t, colonne, 'UPDATE') <> (colonne = ANY (colonnes)) THEN
			RAISE EXCEPTION 'organization : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;

	-- Écrire reste réservé à une personne responsable, à l'arrivée comme au départ.
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'organization'
			AND policyname = 'organization_update' AND cmd = 'UPDATE'
			AND roles = ARRAY['jadwal_app']::name[]
			AND qual LIKE '%is_org_admin()%' AND with_check LIKE '%is_org_admin()%'
	) THEN
		RAISE EXCEPTION 'organization_update : n''exige plus une personne responsable';
	END IF;

	-- Le super-admin garde toute la ligne (ADR 0025).
	IF NOT has_table_privilege('jadwal_superadmin', t, 'UPDATE') THEN
		RAISE EXCEPTION 'organization : le super-admin a perdu la modification';
	END IF;

	-- Le rôle public et celui de la connexion lisent, et n'écrivent rien.
	IF NOT has_table_privilege('jadwal_public', t, 'SELECT') THEN
		RAISE EXCEPTION 'organization : le rôle public ne lit plus la ligne';
	END IF;
	FOREACH role_name IN ARRAY ARRAY['jadwal_public', 'jadwal_auth'] LOOP
		IF has_any_column_privilege(role_name, t, 'INSERT, UPDATE')
			OR has_table_privilege(role_name, t, 'DELETE, TRUNCATE') THEN
			RAISE EXCEPTION 'organization : % écrit dans la table', role_name;
		END IF;
	END LOOP;
END
$verifie$;
