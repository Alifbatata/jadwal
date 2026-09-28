-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Supprimer une session du vendredi est réservé à la personne responsable, pour la base aussi
-- (étape 20, ADR 0046).
--
-- La migration 0065 a réservé la suppression d'un cours, et laissé celle d'une session du vendredi
-- à tout membre : l'écran Vendredi la proposait à l'éditeur. Le chef de projet réserve ce geste
-- comme celui d'un cours : l'écran Vendredi ne le propose plus qu'à la personne responsable, et son
-- action le refuse à l'éditeur. La branche `kind = 'jumua' or` quitte donc la politique, qui exige
-- maintenant `jadwal.is_org_admin()` (migration 0059) pour toute ligne.
--
-- Créer, modifier, publier, annuler et déplacer une session restent à tout membre, comme pour un
-- cours. Le super-admin garde sa propre politique (ADR 0025), et le propriétaire les siennes.
--
-- Le déclencheur de la migration 0069, qui refuse que le type d'une ligne change, reste. Il
-- empêchait qu'on fasse d'un cours une session pour la supprimer ; cette raison tombe, mais aucun
-- écran ne change le type d'une ligne, et la règle ne coûte rien.
--
-- Au rejeu, 0065 remet la branche `jumua` ; ce fichier, rejoué après elle, la retire de nouveau.
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0073_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien.

ALTER POLICY "course_delete" ON "course" TO jadwal_app USING ("course"."organization_id" = (select jadwal.current_org_id()) and ((select jadwal.is_org_admin())));
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
	-- L'expression entière, telle que PostgreSQL la rend : l'organisation du contexte, et la personne
	-- responsable. Plus aucune branche : ni le type du cours, ni une autre condition qui s'ajouterait.
	IF suppression <> '((organization_id = ( SELECT jadwal.current_org_id() AS current_org_id))'
		|| ' AND ( SELECT jadwal.is_org_admin() AS is_org_admin))' THEN
		RAISE EXCEPTION 'course_delete : ne réserve pas la suppression à la personne responsable, ou la laisse encore à l''éditeur (%)',
			suppression;
	END IF;
	-- Les politiques permissives s'additionnent : une seconde, pour le rôle applicatif, pour tous les
	-- rôles (`public`) ou pour toutes les commandes (`ALL`), rouvrirait ce que course_delete ferme.
	-- Il n'y en a qu'une (`test/migration-proofs.test.ts`).
	IF (
		SELECT count(*) FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'course' AND permissive = 'PERMISSIVE'
			AND cmd IN ('DELETE', 'ALL') AND roles && ARRAY['jadwal_app', 'public']::name[]
	) <> 1 THEN
		RAISE EXCEPTION 'course : une autre politique ouvre la suppression au rôle applicatif, à côté de course_delete';
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
	-- Le déclencheur de la migration 0069 reste en place.
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger tg
		WHERE tg.tgrelid = 'public.course'::regclass AND tg.tgname = 'course_kind_fixed'
			AND tg.tgenabled = 'O'
	) THEN
		RAISE EXCEPTION 'course : le déclencheur du type manque, ou il est coupé';
	END IF;
END
$verifie$;
