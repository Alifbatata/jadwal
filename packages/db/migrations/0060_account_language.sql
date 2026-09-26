-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- La langue du compte, que la personne seule modifie (ADR 0046).
--
-- L'espace des responsables se lit en cinq langues, et la langue choisie est retenue pour le compte :
-- une colonne de plus, vide tant que la personne n'a rien choisi, et limitée aux cinq langues de
-- l'espace par une contrainte close par `is true`, comme toutes les autres (ADR 0013). Ces cinq
-- langues sont celles de l'étape 18 (ADR 0046) ; l'ADR 0007 ne traite que de l'interface publique.
--
-- Qui écrit aujourd'hui dans la table des comptes, et comment :
-- - le rôle de connexion (Better Auth) crée et met à jour les comptes. Ses droits sont accordés
--   colonne par colonne (migrations 0029 et 0032) ; sa politique de modification vaut pour toute
--   ligne, et celle d'insertion lui interdit `is_super_admin = true` ;
-- - le rôle applicatif lit les comptes (la personne elle-même, et les membres de l'organisation du
--   contexte), et n'en modifie aucun ;
-- - le super-admin les lit tous, et n'en modifie aucun ;
-- - le propriétaire, sous son drapeau d'entretien.
--
-- Le chemin le plus étroit : le rôle applicatif reçoit le droit de modifier `language`, et cette
-- colonne seule, et une politique de modification ne lui laisse que la ligne de la personne du
-- contexte (`jadwal.user_id`), sans condition d'organisation. Passer par le rôle de connexion aurait
-- confié la règle « la personne seule » à l'application : sa politique vaut pour tous les comptes.
-- Aucune autre colonne du compte ne devient modifiable, pour aucun rôle.
--
-- Le rôle de connexion nomme toutes les colonnes à la création d'un compte, parce que Drizzle nomme
-- toutes les colonnes de la table dans une insertion, même celles qu'il laisse à leur valeur par
-- défaut (migration 0032). Il reçoit donc le droit d'insérer `language`, et sa politique d'insertion
-- exige qu'elle reste vide : c'est la personne qui la choisit, jamais la création du compte. Il ne
-- reçoit pas le droit de la modifier.
--
-- Les instructions sur le schéma sont celles que Drizzle Kit produit (`src/schema/index.ts`), rendues
-- rejouables ; `meta/0060_snapshot.json` est l'instantané qui va avec.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "language" text;
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_language_ck";
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_language_ck" CHECK (("user"."language" is null or "user"."language" in ('fr', 'de', 'it', 'en', 'ar')) is true);
--> statement-breakpoint
GRANT UPDATE ("language") ON "user" TO "jadwal_app";
--> statement-breakpoint
DROP POLICY IF EXISTS "user_update" ON "user";
--> statement-breakpoint
CREATE POLICY "user_update" ON "user" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("user"."id" = (select jadwal.current_user_id())) WITH CHECK ("user"."id" = (select jadwal.current_user_id()));
--> statement-breakpoint
GRANT INSERT ("language") ON "user" TO "jadwal_auth";
--> statement-breakpoint
ALTER POLICY "user_auth_insert" ON "user" TO jadwal_auth WITH CHECK ("user"."is_super_admin" = false and "user"."language" is null);
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	t CONSTANT text := 'public.user';
	colonne text;
	role_name text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_attribute
		WHERE attrelid = t::regclass AND attname = 'language' AND NOT attnotnull AND NOT attisdropped
			AND atttypid = 'text'::regtype
	) THEN
		RAISE EXCEPTION 'user : la colonne language manque, ou n''est pas un texte facultatif';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = t::regclass AND conname = 'user_language_ck' AND contype = 'c'
			AND convalidated AND pg_get_constraintdef(oid) ~* 'IS\s+TRUE\s*\)*\s*$'
			AND pg_get_constraintdef(oid) LIKE '%''fr''%''de''%''it''%''en''%''ar''%'
	) THEN
		RAISE EXCEPTION 'user : la contrainte des langues manque, ou n''est pas close par is true';
	END IF;

	-- Le rôle applicatif ne modifie qu'une colonne du compte, et aucun autre rôle de connexion ne la
	-- modifie. Chaque colonne de la table est relevée, y compris une colonne ajoutée plus tard.
	IF has_table_privilege('jadwal_app', t, 'UPDATE') OR has_table_privilege('jadwal_auth', t, 'UPDATE') THEN
		RAISE EXCEPTION 'user : un rôle de connexion modifie encore toute la ligne';
	END IF;
	FOR colonne IN
		SELECT attname FROM pg_attribute WHERE attrelid = t::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_app', t, colonne, 'UPDATE') <> (colonne = 'language') THEN
			RAISE EXCEPTION 'user : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;
	FOREACH role_name IN ARRAY ARRAY['jadwal_auth', 'jadwal_superadmin', 'jadwal_public', 'public'] LOOP
		IF has_column_privilege(role_name, t, 'language', 'UPDATE') THEN
			RAISE EXCEPTION 'user : % peut modifier la langue d''un compte', role_name;
		END IF;
	END LOOP;
	FOREACH role_name IN ARRAY ARRAY['jadwal_app', 'jadwal_superadmin', 'jadwal_public', 'public'] LOOP
		IF has_any_column_privilege(role_name, t, 'INSERT') THEN
			RAISE EXCEPTION 'user : % peut créer un compte', role_name;
		END IF;
	END LOOP;

	-- La ligne de la personne du contexte, et elle seule.
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'user' AND policyname = 'user_update'
			AND cmd = 'UPDATE' AND roles = ARRAY['jadwal_app']::name[]
			AND qual LIKE '%current_user_id()%' AND with_check LIKE '%current_user_id()%'
			AND qual NOT LIKE '%current_org_id()%' AND qual NOT LIKE '% OR %'
	) THEN
		RAISE EXCEPTION 'user_update : manque, ou ne borne pas à la personne du contexte';
	END IF;
	IF (SELECT count(*) FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'user' AND cmd = 'UPDATE'
			AND 'jadwal_app' = ANY (roles)) <> 1 THEN
		RAISE EXCEPTION 'user : une seule politique de modification pour le rôle applicatif';
	END IF;

	-- Le rôle de connexion crée un compte sans langue, et jamais un compte super-admin.
	IF NOT has_column_privilege('jadwal_auth', t, 'language', 'INSERT') THEN
		RAISE EXCEPTION 'user : le rôle de connexion ne peut plus créer de compte';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'user' AND policyname = 'user_auth_insert'
			AND with_check LIKE '%is_super_admin = false%' AND with_check LIKE '%language IS NULL%'
	) THEN
		RAISE EXCEPTION 'user_auth_insert : doit refuser un compte super-admin et une langue posée';
	END IF;
END
$verifie$;
