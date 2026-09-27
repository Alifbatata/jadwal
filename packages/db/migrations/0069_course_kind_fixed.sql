-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le type d'un cours ne change pas (étape 19, ADR 0033, ADR 0046).
--
-- La migration 0065 réserve la suppression d'un cours à la personne responsable, et laisse celle
-- d'une session du vendredi à tout membre : l'écran Vendredi la propose à l'éditeur. La politique
-- lit le type de la ligne au moment de la suppression. Or la modification d'un cours reste ouverte
-- à tout membre, colonne `kind` comprise : une éditrice faisait d'un cours une session du vendredi
-- (le type, le rang, le vendredi), puis la supprimait. Deux instructions, par un appel direct, et la
-- réserve de 0065 ne tenait plus.
--
-- Aucun écran ne change le type d'une ligne. L'écran Vendredi ne modifie qu'une session ; le
-- formulaire d'un cours ne modifie qu'un cours, et répond qu'il ne connaît pas une session qu'on
-- lui enverrait. Un déclencheur le refuse donc à tout le monde, et pas un droit de colonne :
-- `updateCourse` réécrit le type à chaque modification, avec la valeur qu'il a déjà, et un droit
-- retiré refuserait aussi ces écritures-là. Le déclencheur ne tire que sur un changement réel, par
-- sa clause `WHEN`.
--
-- Il vaut pour tous les rôles, le super-admin et le propriétaire compris : aucun n'a de raison de
-- changer le type d'une ligne, et une règle qui ne dépend pas du rôle n'a pas de branche à oublier.
-- Il ne lit que la ligne : aucune table, donc aucune politique à traverser et aucune récursion. Il
-- lève `restrict_violation` avec un message qui dit la règle, comme ceux des migrations 0012, 0057
-- et 0058.
--
-- Rien à reprendre dans les données : la règle vaut pour les modifications à venir, et chaque ligne
-- garde le type qu'elle a.

CREATE OR REPLACE FUNCTION "jadwal"."refuse_course_kind_change"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN
	RAISE EXCEPTION 'course % keeps its kind: % does not become %', NEW."id", OLD."kind", NEW."kind"
		USING ERRCODE = 'restrict_violation';
END;
$fn$;
--> statement-breakpoint

-- Un déclencheur n'a besoin de personne pour être appelé : le droit direct ne sert à rien, et le
-- test du catalogue exige que le rôle public ne puisse exécuter ici que `count_view` et
-- `has_no_duplicate`.
REVOKE ALL ON FUNCTION "jadwal"."refuse_course_kind_change"() FROM PUBLIC;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "course_kind_fixed" ON "course";
--> statement-breakpoint

-- `BEFORE UPDATE` sans liste de colonnes : un déclencheur `UPDATE OF "kind"` ne tirerait pas si le
-- type changeait sans être nommé dans l'instruction, par un autre déclencheur par exemple.
CREATE TRIGGER "course_kind_fixed"
	BEFORE UPDATE ON "course"
	FOR EACH ROW
	WHEN (OLD."kind" IS DISTINCT FROM NEW."kind")
	EXECUTE FUNCTION "jadwal"."refuse_course_kind_change"();
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	definition text;
BEGIN
	SELECT pg_get_triggerdef(tg.oid) INTO definition
	FROM pg_trigger tg
	WHERE tg.tgrelid = 'public.course'::regclass AND tg.tgname = 'course_kind_fixed'
		AND tg.tgenabled = 'O';
	IF definition IS NULL THEN
		RAISE EXCEPTION 'course : le déclencheur du type manque, ou il est coupé';
	END IF;
	IF definition NOT LIKE '%BEFORE UPDATE ON public.course FOR EACH ROW WHEN ((old.kind IS DISTINCT FROM new.kind)) EXECUTE FUNCTION jadwal.refuse_course_kind_change()%' THEN
		RAISE EXCEPTION 'course : le déclencheur du type n''est pas celui qu''on attend (%)', definition;
	END IF;
END
$verifie$;
