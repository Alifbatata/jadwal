-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- La liste des membres est l'affaire de la personne responsable, pour la base aussi (étape 19,
-- ADR 0046).
--
-- `membership_select` montrait à tout membre les adhésions de l'organisation du contexte, et
-- `user_select`, qui passe par elle, les comptes de ces membres : nom et adresse. Aucun écran ne les
-- montrait à un éditeur, l'écran Membres étant réservé aux responsables, mais un appel direct les
-- rendait, et une erreur de l'application qui les aurait affichés n'aurait pas été arrêtée.
--
-- La première branche de la politique exige maintenant une personne responsable, par
-- `jadwal.is_org_admin()` (migration 0059). La seconde ne change pas : chacun voit ses propres
-- adhésions, dans toutes ses organisations, et c'est d'elles que l'application part pour savoir de
-- quelles organisations une personne est membre, et avec quel rôle. `user_select` n'est pas
-- réécrite : sa sous-requête passe par cette politique, donc un éditeur ne voit plus que son propre
-- compte, et la personne responsable voit ceux de ses membres comme avant. Le super-admin garde sa
-- propre politique (`membership_superadmin_select`) et lit tous les comptes (ADR 0025).
--
-- La garde des personnes désignées (ADR 0013) passe par ce que la personne voit. Un éditeur ne nomme
-- donc plus que lui-même dans une ligne qu'il écrit (`created_by`, `updated_by`), et la personne
-- responsable nomme tout membre, comme avant. L'application ne fait jamais écrire à un éditeur que
-- son propre nom : elle écrit `context.userId`, la personne de la session, et chaque modification
-- d'un cours réécrit `updated_by`. Aucune écriture ordinaire ne dépendait donc de cette lecture.
--
-- Sans personne dans le contexte, `withOrg` avec une organisation seule ne lit plus aucune
-- adhésion, ni aucun compte : il n'y a personne dont la base puisse dire qu'elle est responsable.
--
-- Le déclencheur de la dernière personne responsable (migration 0012) compte les responsables sous
-- les droits de l'appelant. Il ne compte que pour qui retire ou rétrograde une personne responsable,
-- ce que seule une personne responsable peut faire (migration 0059) : elle voit toutes les adhésions
-- de son organisation, et le compte reste juste.
--
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0064_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien. La migration 0059 vérifiait la liste exacte des politiques
-- qui exigent une personne responsable ; elle en vérifie maintenant le minimum, pour rester rejouable
-- après celle-ci, et `test/org-admin.test.ts` tient la liste exacte.

ALTER POLICY "membership_select" ON "membership" TO jadwal_app USING (("membership"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()))
				or "membership"."user_id" = (select jadwal.current_user_id()));
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	lecture text;
	comptes text;
BEGIN
	SELECT coalesce(qual, '') INTO lecture
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'membership' AND policyname = 'membership_select'
		AND cmd = 'SELECT' AND roles = ARRAY['jadwal_app']::name[];
	IF lecture IS NULL THEN
		RAISE EXCEPTION 'membership_select : manque, ou n''est plus au seul rôle applicatif';
	END IF;
	-- Deux branches, et deux seulement : l'organisation pour sa personne responsable, puis soi-même.
	IF lecture NOT LIKE '%organization_id = ( SELECT %current_org_id()%) AND ( SELECT %is_org_admin()%'
		OR lecture NOT LIKE '%OR (user_id = ( SELECT %current_user_id()%'
		OR (length(lecture) - length(replace(lecture, ' OR ', ''))) / 4 <> 1 THEN
		RAISE EXCEPTION 'membership_select : ne réserve pas la liste à la personne responsable (%)',
			lecture;
	END IF;
	-- Les comptes suivent la lecture des adhésions : `user_select` passe toujours par elle.
	SELECT coalesce(qual, '') INTO comptes
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'user' AND policyname = 'user_select'
		AND cmd = 'SELECT' AND roles = ARRAY['jadwal_app']::name[];
	IF comptes IS NULL OR comptes NOT LIKE '%id = ( SELECT %current_user_id()%'
		OR comptes NOT LIKE '%FROM membership m%' THEN
		RAISE EXCEPTION 'user_select : ne passe plus par la lecture des adhésions (%)', comptes;
	END IF;
END
$verifie$;
