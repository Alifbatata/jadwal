-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une personne peut quitter une organisation d'elle-même (étape 19, ADR 0046).
--
-- La migration 0059 a réservé toute suppression d'adhésion à la personne responsable : retirer un
-- membre est un geste de l'écran Membres. Elle a du même coup retiré à un éditeur la suppression de
-- sa propre adhésion, et l'ADR 0046 l'écrivait comme une conséquence. Le chef de projet veut
-- qu'une personne puisse partir seule ; l'écran viendra dans « Vos organisations ».
--
-- La politique laisse maintenant à chacun la suppression de sa propre adhésion, dans l'organisation
-- du contexte, et rien de plus : ni l'adhésion d'un collègue, ni la sienne dans une autre
-- organisation. Retirer un autre membre reste réservé à la personne responsable, par
-- `jadwal.is_org_admin()`. La dernière personne responsable ne part pas : le déclencheur de la
-- migration 0012 la retient, quel que soit le chemin, et il ne change pas.
--
-- Partir efface ce qu'un retrait efface : l'adhésion, et avec elle les acceptations des conditions
-- dans cette organisation, par la clé en cascade (ADR 0044). Le compte reste, comme l'invitation
-- consommée et ce que la personne a écrit.
--
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0066_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien. Au rejeu, la migration 0059 remet la politique réservée,
-- et celle-ci la rouvre à la personne elle-même juste après : l'ordre des fichiers suffit.

ALTER POLICY "membership_delete" ON "membership" TO jadwal_app USING ("membership"."organization_id" = (select jadwal.current_org_id())
				and ((select jadwal.is_org_admin()) or "membership"."user_id" = (select jadwal.current_user_id())));
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	suppression text;
BEGIN
	SELECT coalesce(qual, '') INTO suppression
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'membership' AND policyname = 'membership_delete'
		AND cmd = 'DELETE' AND roles = ARRAY['jadwal_app']::name[];
	IF suppression IS NULL THEN
		RAISE EXCEPTION 'membership_delete : manque, ou n''est plus au seul rôle applicatif';
	END IF;
	-- L'organisation du contexte d'abord, puis la personne responsable ou soi-même.
	IF suppression NOT LIKE '(%organization_id = ( SELECT %current_org_id()%) AND (( SELECT %is_org_admin()%) OR (user_id = ( SELECT %current_user_id()%'
		OR (length(suppression) - length(replace(suppression, ' OR ', ''))) / 4 <> 1 THEN
		RAISE EXCEPTION 'membership_delete : doit laisser partir soi-même, et rien de plus (%)',
			suppression;
	END IF;
	-- La dernière personne responsable reste protégée, sur ce chemin comme sur les autres.
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger
		WHERE tgrelid = 'public.membership'::regclass AND tgname = 'membership_last_org_admin'
			AND tgenabled = 'O'
	) THEN
		RAISE EXCEPTION 'membership : le déclencheur de la dernière personne responsable manque';
	END IF;
END
$verifie$;
