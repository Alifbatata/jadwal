-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Supprimer un cours est réservé à la personne responsable, pour la base aussi (étape 19,
-- ADR 0046).
--
-- `course_delete` ne demandait que l'organisation du contexte : tout membre, éditeur compris,
-- supprimait un cours par un appel direct, ou par l'action `/cours?/supprimer`, qu'aucun écran
-- n'appelle et dont la route n'a pas d'autre garde que l'appartenance. Le chef de projet réserve ce
-- geste à la personne responsable : l'écran Cours le lui proposera, et à elle seule.
--
-- La politique exige maintenant `jadwal.is_org_admin()` (migration 0059), comme les gestes réservés
-- de la migration 0059, sauf pour une session du vendredi. Une session est un cours d'un autre type
-- (ADR 0033), et l'écran Vendredi en propose la suppression à l'éditeur, qui y a accès comme une
-- personne responsable : la réserver ferait mentir cet écran, qui dirait « La session est
-- supprimée » sans que rien ne le soit. Ce n'est donc pas ce que ce fichier change. Un type de cours
-- ajouté plus tard serait réservé d'office : seule `jumua` est nommée.
--
-- Créer, modifier et publier un cours restent à tout membre. Le super-admin garde sa propre
-- politique (ADR 0025), et le propriétaire les siennes.
--
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0065_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien.

ALTER POLICY "course_delete" ON "course" TO jadwal_app USING ("course"."organization_id" = (select jadwal.current_org_id()) and ("course"."kind" = 'jumua' or (select jadwal.is_org_admin())));
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	suppression text;
	politique record;
BEGIN
	SELECT coalesce(qual, '') INTO suppression
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'course' AND policyname = 'course_delete'
		AND cmd = 'DELETE' AND roles = ARRAY['jadwal_app']::name[];
	IF suppression IS NULL THEN
		RAISE EXCEPTION 'course_delete : manque, ou n''est plus au seul rôle applicatif';
	END IF;
	IF suppression NOT LIKE '%organization_id = ( SELECT %current_org_id()%'
		OR suppression NOT LIKE '%kind = ''jumua''::text) OR ( SELECT %is_org_admin()%' THEN
		RAISE EXCEPTION 'course_delete : ne réserve pas la suppression d''un cours (%)', suppression;
	END IF;
	-- Le reste des cours reste à tout membre : ni la lecture, ni l'ajout, ni la modification ne
	-- passent par la fonction.
	FOR politique IN
		SELECT policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS clauses
		FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'course' AND 'jadwal_app' = ANY (roles)
			AND cmd <> 'DELETE'
	LOOP
		IF politique.clauses LIKE '%is_org_admin%' THEN
			RAISE EXCEPTION 'course : % est réservée, alors que l''éditeur garde ce geste',
				politique.policyname;
		END IF;
	END LOOP;
END
$verifie$;
