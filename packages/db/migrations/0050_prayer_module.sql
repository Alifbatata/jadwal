-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
--
-- Les heures de prière deviennent un module, éteint par défaut (ADR 0042).
--
-- jadwal s'adresse maintenant à toute organisation qui donne des cours récurrents. Les heures de
-- prière, l'iqama, la prière du vendredi et l'ancrage d'un cours sur une prière ne parlent qu'à
-- une partie d'entre elles ; pour les autres, ce sont des écrans vides.
--
-- Le drapeau vit sur `organization` et non sur `prayer_settings` : la politique
-- `organization_public_select` donne déjà la ligne entière au rôle public, donc la page publique,
-- le widget et l'API le lisent sans nouvelle politique ni jointure. Sur `prayer_settings`, il
-- aurait fallu ouvrir au public une table qui porte la position saisie à la main.

ALTER TABLE "organization"
	ADD COLUMN IF NOT EXISTS "prayer_module" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

COMMENT ON COLUMN "organization"."prayer_module" IS
	'Le module des heures de prière est-il allumé pour cette organisation (ADR 0042).';
--> statement-breakpoint

-- `false` est le défaut des organisations à venir, pas une extinction rétroactive. Tout ce qui s'en
-- sert déjà le garde allumé : sans cela, la mise à jour viderait la page publique des organisations
-- existantes, et le déclencheur ci-dessous serait contourné par la migration elle-même.
UPDATE "organization" o SET "prayer_module" = true
WHERE NOT o."prayer_module" AND (
	EXISTS (SELECT 1 FROM "prayer_settings" s WHERE s."organization_id" = o."id")
	OR EXISTS (SELECT 1 FROM "prayer_day" d WHERE d."organization_id" = o."id")
	OR EXISTS (SELECT 1 FROM "prayer_period" p WHERE p."organization_id" = o."id")
	OR EXISTS (
		SELECT 1 FROM "course" c
		WHERE c."organization_id" = o."id"
			AND (c."kind" = 'jumua' OR c."timing_kind" = 'prayer')
	)
);
--> statement-breakpoint

-- Deux choses cessent d'avoir un sens quand le module s'éteint : un cours ancré sur une prière n'a
-- plus d'heure calculable, et une session du vendredi est une prière. La règle est portée par la
-- base, donc elle tient quel que soit le code appelant — une interface qui oublierait de la
-- vérifier échoue au lieu de laisser une page publique avec des cours sans heure.
--
-- Aux droits de l'appelant, comme `refuse_last_org_admin` (migration 0012) et pour la même raison :
-- à droits du définisseur, la fonction tournerait sous le propriétaire, lui-même soumis à la
-- sécurité au niveau des lignes depuis l'ADR 0019 et sans politique de lecture hors de son drapeau
-- d'entretien ; le comptage rendrait toujours zéro et le déclencheur laisserait tout passer. C'est
-- le sens dangereux : un déclencheur muet se croit posé et ne refuse rien.
--
-- `search_path` est figé : sans cela, un schéma temporaire posé par l'appelant pourrait détourner
-- le nom `course`.
CREATE OR REPLACE FUNCTION "jadwal"."refuse_prayer_module_off"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	ancres integer;
	vendredis integer;
BEGIN
	-- Seule l'extinction est surveillée. Allumer n'a jamais besoin de permission.
	IF NEW."prayer_module" OR NOT OLD."prayer_module" THEN RETURN NEW; END IF;

	SELECT
		count(*) FILTER (WHERE c."timing_kind" = 'prayer'),
		count(*) FILTER (WHERE c."kind" = 'jumua')
	INTO ancres, vendredis
	FROM public."course" c
	WHERE c."organization_id" = NEW."id"
		AND (c."timing_kind" = 'prayer' OR c."kind" = 'jumua');

	IF ancres > 0 OR vendredis > 0 THEN
		RAISE EXCEPTION
			'prayer_module_still_used: % cours ancre(s) sur une priere, % session(s) du vendredi',
			ancres, vendredis
			USING ERRCODE = 'raise_exception';
	END IF;

	RETURN NEW;
END;
$fn$;
--> statement-breakpoint

-- Une fonction fraîchement créée est exécutable par tout le monde. Un déclencheur n'a besoin
-- de personne pour être appelé : le droit direct ne sert à rien et un test du catalogue exige
-- que le rôle public ne puisse exécuter ici que `count_view` et `has_no_duplicate`.
REVOKE ALL ON FUNCTION "jadwal"."refuse_prayer_module_off"() FROM PUBLIC;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "organization_prayer_module_off" ON "organization";
--> statement-breakpoint

CREATE TRIGGER "organization_prayer_module_off"
	BEFORE UPDATE OF "prayer_module" ON "organization"
	FOR EACH ROW
	EXECUTE FUNCTION "jadwal"."refuse_prayer_module_off"();
--> statement-breakpoint

-- L'invariant a deux sens, et n'en tenir qu'un le rend faux.
--
-- Le déclencheur ci-dessus empêche d'éteindre le module pendant qu'un cours s'y appuie. Sans celui
-- qui suit, il resterait possible de créer ce cours **après** l'extinction : la page publique
-- afficherait alors un cours dont l'heure ne peut pas être calculée, puisque plus aucune heure de
-- prière n'est lue. L'écran ne propose pas l'ancrage quand le module est éteint, mais un envoi de
-- formulaire fabriqué à la main ne passe pas par l'écran.
CREATE OR REPLACE FUNCTION "jadwal"."refuse_prayer_course_without_module"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	allume boolean;
BEGIN
	IF NEW."timing_kind" <> 'prayer' AND NEW."kind" <> 'jumua' THEN RETURN NEW; END IF;

	SELECT o."prayer_module" INTO allume
	FROM public."organization" o WHERE o."id" = NEW."organization_id";

	-- Organisation invisible pour l'appelant : l'écriture échouera de toute façon sur sa propre
	-- politique. Refuser ici donnerait un message trompeur sur une cause qui n'est pas la bonne.
	IF allume IS NULL OR allume THEN RETURN NEW; END IF;

	RAISE EXCEPTION 'prayer_module_off: le module des heures de priere est eteint'
		USING ERRCODE = 'raise_exception';
END;
$fn$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION "jadwal"."refuse_prayer_course_without_module"() FROM PUBLIC;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "course_needs_prayer_module" ON "course";
--> statement-breakpoint

CREATE TRIGGER "course_needs_prayer_module"
	BEFORE INSERT OR UPDATE OF "timing_kind", "kind", "organization_id" ON "course"
	FOR EACH ROW
	EXECUTE FUNCTION "jadwal"."refuse_prayer_course_without_module"();
