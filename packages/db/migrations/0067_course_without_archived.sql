-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Un cours est un brouillon ou il est publié : l'état « archivé » disparaît (étape 19).
--
-- La base acceptait trois états. Aucun écran n'a jamais posé le troisième, et le formulaire d'un
-- cours ne le connaissait pas : enregistrer un cours archivé le repassait en brouillon sans le dire.
-- Le chef de projet retire l'état du modèle et des textes plutôt que de lui donner un écran.
--
-- 1. Toute ligne archivée redevient un brouillon, avant que la contrainte ne se ferme. Pour le
--    public, rien ne change : un brouillon lui est invisible comme l'était un cours archivé
--    (`course_public_select`). Le propriétaire est soumis à la sécurité au niveau des lignes
--    (ADR 0019) : hors de son drapeau d'entretien, la mise à jour ne toucherait aucune ligne, sans
--    rien dire. Le drapeau est donc posé pour elle seule, à la façon de `set local`, puis coupé :
--    Drizzle joue tout le lot de migrations dans une seule transaction, et les suivantes n'ont pas à
--    l'hériter. La date de modification suit, comme pour toute écriture d'un cours ; la révision
--    (`sequence`) ne bouge pas, puisque le cours ne part dans aucun flux.
-- 2. La contrainte ne connaît plus que `draft` et `published`. Sa validation lit toutes les lignes,
--    sans politique : si une ligne archivée restait, la migration échouerait, et rien ne serait
--    appliqué.
--
-- Les deux instructions sur la contrainte sont celles que Drizzle Kit produit pour le schéma
-- (`src/schema/index.ts`), rendues rejouables ; `meta/0067_snapshot.json` est l'instantané qui va
-- avec.

SELECT set_config('jadwal.maintenance', 'on', true);
--> statement-breakpoint
UPDATE "course" SET "status" = 'draft', "updated_at" = now() WHERE "status" = 'archived';
--> statement-breakpoint
SELECT set_config('jadwal.maintenance', 'off', true);
--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT IF EXISTS "course_status_ck";
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_status_ck" CHECK (("course"."status" in ('draft', 'published')) is true);
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	definition text;
BEGIN
	SELECT pg_get_constraintdef(oid) INTO definition
	FROM pg_constraint
	WHERE conrelid = 'public.course'::regclass AND conname = 'course_status_ck'
		AND contype = 'c' AND convalidated;
	IF definition IS NULL THEN
		RAISE EXCEPTION 'course : la contrainte des états manque, ou n''est pas validée';
	END IF;
	IF definition !~* 'IS\s+TRUE\s*\)*\s*$' THEN
		RAISE EXCEPTION 'course_status_ck : doit être close par is true (%)', definition;
	END IF;
	IF definition NOT LIKE '%''draft''%''published''%' OR definition LIKE '%archived%' THEN
		RAISE EXCEPTION 'course_status_ck : doit connaître draft et published, et eux seuls (%)',
			definition;
	END IF;
	IF jadwal.maintenance() THEN
		RAISE EXCEPTION 'course : le drapeau d''entretien est resté posé après la mise à jour';
	END IF;
END
$verifie$;
