-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le super-admin entré dans une organisation ne voit et ne touche plus qu'elle (ADR 0025).
--
-- `organization_superadmin_select`, `_update` et `_delete` valaient `true`. Entré dans A, le
-- super-admin lisait aussi B : quatre lectures de l'application qui ne filtraient pas sur le
-- contexte lui ont montré les réglages d'une autre organisation que la sienne. Elles ont été
-- corrigées une à une à l'étape 16, et rien n'empêchait d'en écrire une cinquième. À l'écriture,
-- c'était pire : une instruction sans `where`, tapée depuis A, modifiait ou supprimait toutes les
-- organisations du service. C'est la méprise que le contexte arrête sur toutes les autres tables
-- d'organisation.
--
-- La règle devient : un contexte posé ne montre que son organisation ; quand aucun contexte n'est
-- posé, le super-admin les voit toutes. La console du super-admin liste, crée, change le plan et
-- l'état, et lit l'organisation où il va entrer (`chooseOrganisation`, `currentOrganisation`),
-- toujours sans contexte : rien ne change pour elle. Tout ce qui passe par `withSessionOrg` porte
-- le contexte, et ne lisait déjà que lui depuis l'étape 16.
--
-- « Aucun contexte » veut dire un réglage absent ou vide, jamais un réglage illisible.
-- `current_org_id()` rend nul un identifiant mal formé, mais un tel contexte n'ouvre pas la console :
-- il ne montre rien, comme sur les autres tables (ADR 0013).
--
-- Relevé, dans le catalogue, des politiques du super-admin qui ne lisent pas le contexte :
--   `organization` INSERT : créer une organisation n'en touche aucune autre, elle reste ouverte ;
--   `user` SELECT : un compte n'appartient à aucune organisation, et il les lit tous par décision
--     (ADR 0025) ;
--   `admin_access_log` SELECT et INSERT : son registre à lui, écrit aussi hors de tout contexte.
-- Aucune n'a le même défaut. `test/superadmin-context.test.ts` échoue si une autre s'y ajoute.
--
-- Les trois instructions sont celles que Drizzle Kit produit pour le schéma. `ALTER POLICY`
-- remplace l'expression à l'identique : le rejeu ne change rien.

ALTER POLICY "organization_superadmin_select" ON "organization" TO jadwal_superadmin USING ("organization"."id" = (select jadwal.current_org_id()) or (select coalesce(current_setting('jadwal.org_id', true), '')) = '');
--> statement-breakpoint
ALTER POLICY "organization_superadmin_update" ON "organization" TO jadwal_superadmin USING ("organization"."id" = (select jadwal.current_org_id()) or (select coalesce(current_setting('jadwal.org_id', true), '')) = '') WITH CHECK ("organization"."id" = (select jadwal.current_org_id()) or (select coalesce(current_setting('jadwal.org_id', true), '')) = '');
--> statement-breakpoint
ALTER POLICY "organization_superadmin_delete" ON "organization" TO jadwal_superadmin USING ("organization"."id" = (select jadwal.current_org_id()) or (select coalesce(current_setting('jadwal.org_id', true), '')) = '');
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	politique record;
	bornees integer := 0;
BEGIN
	FOR politique IN
		SELECT policyname, cmd, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
		FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'organization'
			AND 'jadwal_superadmin' = ANY (roles)
	LOOP
		IF politique.cmd = 'INSERT' THEN
			-- La création reste ouverte, et c'est la seule.
			IF politique.with_check <> 'true' THEN
				RAISE EXCEPTION 'organization : % n''est plus ouverte', politique.policyname;
			END IF;
			CONTINUE;
		END IF;
		-- Chaque branche compte : sans la première, le super-admin ne verrait plus rien une fois
		-- entré ; sans la seconde, sa console ne verrait plus rien.
		IF politique.qual NOT LIKE '%current_org_id()%'
			OR politique.qual NOT LIKE '%current_setting(''jadwal.org_id''%' THEN
			RAISE EXCEPTION 'organization : % ne borne pas le super-admin au contexte',
				politique.policyname;
		END IF;
		IF politique.cmd = 'UPDATE' AND (politique.with_check NOT LIKE '%current_org_id()%'
			OR politique.with_check NOT LIKE '%current_setting(''jadwal.org_id''%') THEN
			RAISE EXCEPTION 'organization : % laisse écrire hors du contexte', politique.policyname;
		END IF;
		bornees := bornees + 1;
	END LOOP;
	IF bornees <> 3 THEN
		RAISE EXCEPTION 'organization : % politiques bornées au lieu de trois', bornees;
	END IF;
END
$verifie$;
