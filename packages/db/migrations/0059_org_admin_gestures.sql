-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- La base distingue l'éditeur du responsable, pour le rôle applicatif (ADR 0046).
--
-- Jusqu'ici, à l'intérieur d'une organisation, la base ne séparait pas les deux rôles : l'application
-- réservait des écrans aux personnes responsables, et la base laissait toute personne qui avait le
-- contexte de l'organisation faire la même chose par un appel direct. Changer un rôle, le sien
-- compris (migration 0053), s'écrire une invitation de responsable, l'accepter et adhérer avec ce
-- rôle (ADR 0017, « Limite du rôle »), retirer un membre, modifier les réglages, les salles et les
-- heures de prière. La faille de l'étape 17 a montré ce que cela coûte : un rôle mal lu dans
-- l'application suffisait.
--
-- 1. `jadwal.is_org_admin()` dit si la personne du contexte (`jadwal.user_id`) est responsable de
--    l'organisation du contexte (`jadwal.org_id`). Elle est faite sur le modèle de `jadwal.invited`
--    (migrations 0024 et 0058) : droits du définisseur, chemin de recherche figé, exécution accordée
--    au seul rôle applicatif. Sans argument : elle ne répond que sur le contexte, que l'application
--    pose à partir de la session, jamais sur une personne ou une organisation qu'on lui passerait.
--    Sans personne, ou sans organisation, elle répond non.
--
--    Pourquoi à droits du définisseur. Les politiques des adhésions l'appellent elles-mêmes : lue
--    aux droits de l'appelant, la lecture des adhésions repasserait par ces politiques. Elle est
--    évaluée sous le propriétaire, qui est soumis à la sécurité au niveau des lignes (ADR 0019) et
--    ne lit rien hors de son drapeau d'entretien. D'où une politique de lecture de plus, pour lui
--    seul, sur le modèle de `invitation_owner_read` (migration 0024), mais plus étroite : elle ne
--    lui montre que l'adhésion de la personne du contexte dans l'organisation du contexte, et ne lit
--    aucune autre table. La chaîne s'arrête là : pas de récursion.
--
--    La fonction est stable, et les politiques l'appellent entre parenthèses : elle est évaluée une
--    fois par instruction, sur l'état d'avant l'instruction. Une personne responsable qui se passe
--    elle-même éditrice le peut donc, tant qu'une autre reste responsable (le déclencheur de la
--    migration 0012 ne change pas).
--
-- 2. Les politiques des gestes réservés l'exigent. La liste vient de l'application telle qu'elle est
--    (`apps/web/src` : `mustAdminister`, `mustAdministerPrayerModule`, `mustBeAdmin`, et les liens de
--    navigation montrés selon le rôle), et l'ADR 0046 la tient à jour :
--    - `invitation` : lire les invitations de l'organisation, en écrire, en annuler, en supprimer
--      (écran des membres). La branche de la personne invitée, reconnue par son adresse, ne change
--      pas : elle voit, accepte ou décline l'invitation reçue, sans contexte d'organisation ;
--    - `membership` : changer un rôle, retirer un membre (écran des membres). L'insertion ne change
--      pas : c'est la personne invitée qui crée son adhésion, avec le rôle de son invitation
--      (migration 0058), et c'est l'écriture de l'invitation qui est réservée ;
--    - `organization` : les réglages et le module des prières (écran des réglages) ;
--    - `room` : ajouter, renommer, supprimer une salle (écran des réglages) ;
--    - `prayer_settings`, `prayer_day`, `prayer_period` : les heures de prière (écran des prières).
--    La lecture de ces tables reste ouverte à tous les membres, invitations exceptées : le programme
--    public en dépend, et l'écran des cours lit les salles et les heures.
--
--    Ce qui ne change pas : les cours, leurs traductions, les exceptions, les pauses, le journal et
--    l'acceptation des conditions restent écrits par tout membre, éditeur compris ; la lecture des
--    adhésions et des comptes aussi (la garde des personnes désignées, ADR 0013, s'appuie sur elle :
--    une éditrice qui annule la séance qu'une collègue avait déplacée écrit une ligne qui la nomme).
--    Le super-admin garde ses pouvoirs (ADR 0025) : ses politiques ne passent pas par cette
--    fonction, et il ne peut pas l'appeler. Aucune politique du propriétaire ne passe non plus par
--    elle : il peut l'appeler, puisqu'elle lui appartient, mais aucun de ses droits n'en dépend.
--    Les règles des migrations 0053 à 0058 restent telles quelles.
--
-- 3. Les colonnes de l'organisation. Le rôle applicatif pouvait modifier toute la ligne, plan, état,
--    identifiant d'URL et date de création compris, alors que l'écran des réglages n'en écrit que
--    huit. Le plan et l'état relèvent du super-admin (ADR 0025), et changer l'identifiant d'URL
--    casserait toutes les adresses publiques. Le droit est ramené aux colonnes de l'écran, comme la
--    migration 0053 l'a fait pour les adhésions. Au rejeu, la migration 0002 rend le droit large, et
--    celle-ci le retire juste après : l'ordre des fichiers suffit.
--
-- Limite. Cette séparation arrête les erreurs de l'application : un contrôle oublié, un rôle mal lu,
-- un contexte posé sur la bonne organisation mais pour la mauvaise raison. Elle n'arrête pas qui
-- tient le mot de passe du rôle applicatif : il pose lui-même le contexte, organisation et personne
-- comprises, et peut donc se dire responsable (`docs/SECURITE.md`, barrière 1).
--
-- Les instructions `ALTER POLICY` sont celles que Drizzle Kit produit pour le schéma
-- (`src/schema/index.ts`), et `meta/0059_snapshot.json` est l'instantané qui va avec : une prochaine
-- génération part de là. `ALTER POLICY` remplace l'expression à l'identique : le rejeu ne change
-- rien.

-- 1. La fonction, puis la lecture du propriétaire dont elle a besoin.
CREATE OR REPLACE FUNCTION "jadwal"."is_org_admin"()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
	SELECT EXISTS (
		SELECT 1 FROM public."membership" m
		WHERE m."organization_id" = jadwal.current_org_id()
			AND m."user_id" = jadwal.current_user_id()
			AND m."role" = 'org_admin'
	)
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."is_org_admin"() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."is_org_admin"() TO "jadwal_app";
--> statement-breakpoint
DROP POLICY IF EXISTS "membership_owner_read" ON "membership";
--> statement-breakpoint
CREATE POLICY "membership_owner_read" ON "membership"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner"
	USING (
		"organization_id" = (select jadwal.current_org_id())
		AND "user_id" = (select jadwal.current_user_id())
	);
--> statement-breakpoint

-- 2. Les politiques des gestes réservés.
ALTER POLICY "invitation_select" ON "invitation" TO jadwal_app USING (("invitation"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()))
				or exists (
					select 1 from "user" u
					where u."id" = (select jadwal.current_user_id()) and lower(u."email") = lower("invitation"."email")
				));
--> statement-breakpoint
ALTER POLICY "invitation_insert" ON "invitation" TO jadwal_app WITH CHECK ("invitation"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())
				and ("invitation"."invited_by" is null or exists (select 1 from "user" u where u."id" = "invitation"."invited_by")));
--> statement-breakpoint
ALTER POLICY "invitation_update" ON "invitation" TO jadwal_app USING (("invitation"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()))
				or exists (
					select 1 from "user" u
					where u."id" = (select jadwal.current_user_id()) and lower(u."email") = lower("invitation"."email")
				)) WITH CHECK (("invitation"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()))
				or exists (
					select 1 from "user" u
					where u."id" = (select jadwal.current_user_id()) and lower(u."email") = lower("invitation"."email")
				));
--> statement-breakpoint
ALTER POLICY "invitation_delete" ON "invitation" TO jadwal_app USING ("invitation"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "membership_update" ON "membership" TO jadwal_app USING ("membership"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())) WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "membership_delete" ON "membership" TO jadwal_app USING ("membership"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "organization_update" ON "organization" TO jadwal_app USING ("organization"."id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())) WITH CHECK ("organization"."id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_day_insert" ON "prayer_day" TO jadwal_app WITH CHECK ("prayer_day"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_day_update" ON "prayer_day" TO jadwal_app USING ("prayer_day"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())) WITH CHECK ("prayer_day"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_day_delete" ON "prayer_day" TO jadwal_app USING ("prayer_day"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_period_insert" ON "prayer_period" TO jadwal_app WITH CHECK ("prayer_period"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_period_update" ON "prayer_period" TO jadwal_app USING ("prayer_period"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())) WITH CHECK ("prayer_period"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_period_delete" ON "prayer_period" TO jadwal_app USING ("prayer_period"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_settings_insert" ON "prayer_settings" TO jadwal_app WITH CHECK ("prayer_settings"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_settings_update" ON "prayer_settings" TO jadwal_app USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())) WITH CHECK ("prayer_settings"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "prayer_settings_delete" ON "prayer_settings" TO jadwal_app USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "room_insert" ON "room" TO jadwal_app WITH CHECK ("room"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "room_update" ON "room" TO jadwal_app USING ("room"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin())) WITH CHECK ("room"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint
ALTER POLICY "room_delete" ON "room" TO jadwal_app USING ("room"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint

-- 3. Les colonnes de l'organisation que le rôle applicatif peut modifier : celles de l'écran des
--    réglages. Retirer le droit de table retire aussi les droits de colonne correspondants : l'accord
--    qui suit repart de zéro, au premier passage comme au rejeu.
REVOKE UPDATE ON "organization" FROM "jadwal_app";
--> statement-breakpoint
GRANT UPDATE ("name", "time_zone", "accent_color", "greeting", "enabled_language",
	"default_language", "prayer_module", "updated_at") ON "organization" TO "jadwal_app";
--> statement-breakpoint

-- 4. La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier
--    annonce, la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	reservees CONSTANT text[] := ARRAY[
		'invitation.invitation_delete', 'invitation.invitation_insert',
		'invitation.invitation_select', 'invitation.invitation_update',
		'membership.membership_delete', 'membership.membership_update',
		'organization.organization_update',
		'prayer_day.prayer_day_delete', 'prayer_day.prayer_day_insert', 'prayer_day.prayer_day_update',
		'prayer_period.prayer_period_delete', 'prayer_period.prayer_period_insert',
		'prayer_period.prayer_period_update',
		'prayer_settings.prayer_settings_delete', 'prayer_settings.prayer_settings_insert',
		'prayer_settings.prayer_settings_update',
		'room.room_delete', 'room.room_insert', 'room.room_update'
	];
	colonnes CONSTANT text[] := ARRAY['name', 'time_zone', 'accent_color', 'greeting',
		'enabled_language', 'default_language', 'prayer_module', 'updated_at'];
	trouvees text[];
	politique record;
	colonne text;
	role_name text;
BEGIN
	-- La fonction : droits du définisseur, stable, chemin figé, sans argument, et ce qu'elle lit.
	IF NOT EXISTS (
		SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'jadwal' AND p.proname = 'is_org_admin' AND p.prosecdef
			AND p.provolatile = 's' AND p.proconfig IS NOT NULL
			AND pg_get_function_identity_arguments(p.oid) = ''
	) THEN
		RAISE EXCEPTION 'jadwal.is_org_admin : doit être à droits du définisseur, stable, chemin figé';
	END IF;
	IF pg_get_functiondef('jadwal.is_org_admin()'::regprocedure) NOT LIKE '%m."role" = ''org_admin''%'
		OR pg_get_functiondef('jadwal.is_org_admin()'::regprocedure) NOT LIKE '%jadwal.current_org_id()%'
		OR pg_get_functiondef('jadwal.is_org_admin()'::regprocedure) NOT LIKE '%jadwal.current_user_id()%' THEN
		RAISE EXCEPTION 'jadwal.is_org_admin : ne lit pas le rôle de la personne du contexte';
	END IF;
	IF NOT has_function_privilege('jadwal_app', 'jadwal.is_org_admin()', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.is_org_admin : le rôle applicatif ne peut pas l''appeler';
	END IF;
	FOREACH role_name IN ARRAY ARRAY['jadwal_superadmin', 'jadwal_auth', 'jadwal_public', 'public'] LOOP
		IF has_function_privilege(role_name, 'jadwal.is_org_admin()', 'EXECUTE') THEN
			RAISE EXCEPTION 'jadwal.is_org_admin : % peut l''appeler', role_name;
		END IF;
	END LOOP;

	-- La lecture du propriétaire : l'adhésion du contexte, et rien d'autre.
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'membership'
			AND policyname = 'membership_owner_read' AND cmd = 'SELECT'
			AND roles = ARRAY['jadwal_owner']::name[]
			AND qual LIKE '%organization_id = ( SELECT %current_org_id()%'
			AND qual LIKE '%user_id = ( SELECT %current_user_id()%'
			AND qual NOT LIKE '%maintenance%' AND qual NOT LIKE '% OR %'
	) THEN
		RAISE EXCEPTION 'membership_owner_read : manque, ou lit plus que l''adhésion du contexte';
	END IF;

	-- Les politiques du rôle applicatif qui exigent une personne responsable : au moins celles-ci.
	-- Jusqu'à l'étape 18, c'était « exactement celles-ci ». Les migrations suivantes en ajoutent
	-- (0064 : lire les membres ; 0065 : supprimer un cours), et ce fichier doit rester rejouable après
	-- elles : la liste exacte est tenue par `test/org-admin.test.ts`, qui la relit à chaque passage.
	SELECT array_agg(tablename || '.' || policyname ORDER BY tablename || '.' || policyname)
	INTO trouvees
	FROM pg_policies
	WHERE schemaname = 'public' AND 'jadwal_app' = ANY (roles)
		AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%is_org_admin()%';
	IF trouvees IS NULL OR NOT (trouvees @> reservees) THEN
		RAISE EXCEPTION 'politiques réservées aux responsables : % au lieu d''au moins %',
			trouvees, reservees;
	END IF;
	-- Et chacune dans chacune de ses clauses : une modification qui ne l'exigerait qu'à l'arrivée
	-- laisserait encore voir la ligne, une qui ne l'exigerait qu'au départ laisserait la déplacer.
	FOR politique IN
		SELECT tablename, policyname, cmd, coalesce(qual, '') AS qual,
			coalesce(with_check, '') AS with_check
		FROM pg_policies
		WHERE schemaname = 'public' AND tablename || '.' || policyname = ANY (reservees)
	LOOP
		IF politique.cmd IN ('SELECT', 'UPDATE', 'DELETE') AND politique.qual NOT LIKE '%is_org_admin()%' THEN
			RAISE EXCEPTION '%.% : la ligne visée n''exige pas une personne responsable',
				politique.tablename, politique.policyname;
		END IF;
		IF politique.cmd IN ('INSERT', 'UPDATE') AND politique.with_check NOT LIKE '%is_org_admin()%' THEN
			RAISE EXCEPTION '%.% : la ligne écrite n''exige pas une personne responsable',
				politique.tablename, politique.policyname;
		END IF;
	END LOOP;
	-- Aucune politique d'un autre rôle ne l'appelle : ni le super-admin, ni le public, ni le
	-- propriétaire ne passent par elle.
	IF EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND NOT ('jadwal_app' = ANY (roles))
			AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%is_org_admin%'
	) THEN
		RAISE EXCEPTION 'is_org_admin : une politique d''un autre rôle que jadwal_app l''appelle';
	END IF;

	-- Les colonnes de l'organisation : celles de l'écran des réglages, et aucune autre.
	IF has_table_privilege('jadwal_app', 'public.organization', 'UPDATE') THEN
		RAISE EXCEPTION 'organization : jadwal_app modifie encore toute la ligne';
	END IF;
	FOR colonne IN
		SELECT attname FROM pg_attribute
		WHERE attrelid = 'public.organization'::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_app', 'public.organization', colonne, 'UPDATE')
			<> (colonne = ANY (colonnes)) THEN
			RAISE EXCEPTION 'organization : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;
	-- Le super-admin garde toute la ligne (ADR 0025).
	IF NOT has_table_privilege('jadwal_superadmin', 'public.organization', 'UPDATE') THEN
		RAISE EXCEPTION 'organization : le super-admin a perdu la modification';
	END IF;
END
$verifie$;
