-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une organisation ne publie que des langues que le public sait écrire (étape 18).
--
-- Jusqu'ici, la base vérifiait que la liste des langues d'une organisation n'était ni vide ni
-- trouée (`organization_language_ck`), et que la langue par défaut en faisait partie
-- (`organization_default_language_ck`). Elle acceptait n'importe quel code : « tr », enregistré par
-- l'écran des réglages le temps d'un mutant de la relecture du lot 1, était rendu en 200. La page
-- publique, le widget et le flux agenda auraient alors proposé une langue sans une ligne pour
-- l'écrire.
--
-- La contrainte ajoutée limite la liste aux cinq langues du public (ADR 0007, anglais ajouté à
-- l'étape 18) : français, allemand, italien, anglais britannique, arabe. Elle nomme aussi la langue
-- par défaut, qui en découle déjà, pour que la règle se lise en un seul endroit. Elle est close par
-- `is true`, comme toutes les autres (ADR 0013) : un tableau absent rendrait NULL, et NULL passerait.
--
-- Les écritures d'aujourd'hui y sont toutes conformes : l'écran des réglages ne propose que ces
-- cinq langues (`LANGUES` de `apps/web/src/lib/i18n.ts`), et le super-admin crée une organisation en
-- français. Si une ligne ne l'était pas, l'ajout de la contrainte échouerait, et la migration avec
-- lui, sans rien appliquer : on corrige la ligne, puis on relance.
--
-- L'instruction sur le schéma est celle que Drizzle Kit produit (`src/schema/index.ts`), rendue
-- rejouable ; `meta/0062_snapshot.json` est l'instantané qui va avec.

ALTER TABLE "organization" DROP CONSTRAINT IF EXISTS "organization_language_known_ck";
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_language_known_ck" CHECK (("organization"."enabled_language" <@ array['fr', 'de', 'it', 'en', 'ar']::text[] and "organization"."default_language" in ('fr', 'de', 'it', 'en', 'ar')) is true);
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	definition text;
BEGIN
	SELECT pg_get_constraintdef(oid) INTO definition
	FROM pg_constraint
	WHERE conrelid = 'public.organization'::regclass AND conname = 'organization_language_known_ck'
		AND contype = 'c' AND convalidated;
	IF definition IS NULL THEN
		RAISE EXCEPTION 'organization : la contrainte des langues connues manque, ou n''est pas validée';
	END IF;
	IF definition !~* 'IS\s+TRUE\s*\)*\s*$' THEN
		RAISE EXCEPTION 'organization_language_known_ck : doit être close par is true (%)', definition;
	END IF;
	IF definition !~ 'enabled_language <@' OR definition !~ 'default_language = ANY'
		OR definition NOT LIKE '%''fr''%''de''%''it''%''en''%''ar''%''fr''%''de''%''it''%''en''%''ar''%' THEN
		RAISE EXCEPTION 'organization_language_known_ck : doit borner les langues publiées et la langue par défaut aux cinq langues du public (%)',
			definition;
	END IF;
	-- Les deux contraintes d'avant restent : liste non vide, et langue par défaut dans la liste.
	IF (SELECT count(*) FROM pg_constraint
		WHERE conrelid = 'public.organization'::regclass AND contype = 'c' AND convalidated
			AND conname IN ('organization_language_ck', 'organization_default_language_ck')) <> 2 THEN
		RAISE EXCEPTION 'organization : une contrainte des langues d''avant manque';
	END IF;
END
$verifie$;
