-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une invitation ne vaut qu'une fois, pour le rôle qu'elle nomme, et la base tient ses passages de
-- statut (ADR 0017).
--
-- Trois trous, antérieurs à l'étape 17, trouvés par ses relectures dans le modèle que vise déjà la
-- migration 0057 : une requête tapée sous un rôle de connexion, hors de l'écran.
--
-- 1. Le rôle. Ni `jadwal.invited` ni la politique d'insertion des adhésions ne regardaient le rôle de
--    l'invitation. Une personne invitée comme éditrice acceptait, puis créait elle-même une adhésion
--    de responsable. L'écran insère le rôle de l'invitation, mais rien dans la base ne l'y obligeait.
--    `jadwal.invited` reçoit désormais le rôle de la ligne à insérer, et exige une invitation de ce
--    rôle-là : une adhésion née d'une invitation porte exactement le rôle de celle-ci. Le super-admin
--    n'est pas concerné : sa politique d'insertion ne passe pas par cette fonction (migration 0033),
--    il nomme qui il veut, avec le rôle qu'il veut, dans l'organisation où il est entré (ADR 0025).
--
-- 2. Une seule fois. L'adhésion créée consomme l'invitation (migration 0029). Mais une personne déjà
--    membre, réinvitée, qui accepte, n'en crée aucune : l'insertion de l'écran ne faisait rien
--    (`on conflict do nothing`), le déclencheur de 0029 ne tirait pas, et l'invitation restait
--    « accepted ». Retirée ensuite, la personne se remettait seule dans l'organisation par un appel
--    direct, tant que l'invitation courait. Désormais, l'acceptation par une personne déjà membre
--    consomme l'invitation sur-le-champ : elle passe à « joined » au lieu de « accepted ». La personne
--    garde son adhésion et son rôle.
--
--    Pourquoi à l'acceptation, et pas au retrait. Consommer au retrait obligeait à suivre tous les
--    chemins qui suppriment une adhésion : l'écran, le super-admin, le propriétaire, et la cascade de
--    la suppression d'un compte, qui vide aussi `accepted_by`. À l'acceptation, il suffit de suivre
--    un seul geste, le passage à « accepted » : depuis le point 3, c'est le seul qui nomme une
--    personne dans `accepted_by`.
--
--    La fonction lit `membership` avec les droits de l'appelant. Depuis le point 3, seule la personne
--    à qui l'invitation est adressée l'accepte, à son propre nom : la lecture porte donc sur ses
--    propres adhésions, qu'elle voit où qu'elles soient (migration 0022). Le super-admin, lui,
--    n'accepte que les invitations reçues à sa propre adresse, dans l'organisation où il est entré,
--    dont il voit les adhésions. Le propriétaire, sous son drapeau, voit tout. Cette lecture passe
--    par les politiques de lecture des adhésions, qui ne lisent aucune autre table : pas de
--    récursion.
--
-- 3. Les passages de statut. La politique de modification laisse la personne invitée écrire
--    n'importe quel statut sur toute ligne reçue à son adresse, et toute personne qui a le contexte
--    de l'organisation sur toute ligne de celle-ci. Une invitation consommée repassait à « pending »
--    ou à « accepted », et resservait après un retrait. Une invitation annulée par la personne
--    responsable s'acceptait encore, ce que l'ADR 0017 exclut. Une acceptation changeait de mains
--    depuis un contexte vide, vers une membre dont le déclencheur du point 2 ne voyait pas
--    l'adhésion, et n'était pas consommée. Et la date de réponse, que le rôle applicatif peut écrire
--    lui aussi, se repoussait : la purge des invitations résolues compte ses quatre-vingt-dix jours
--    depuis elle (`docs/CONDITIONS.md`), et une date lointaine gardait l'adresse sans fin.
--
--    Les gestes légitimes qui écrivent une invitation, relevés dans `apps/web/src`,
--    `packages/db/scripts` et les migrations :
--    a. inviter, par l'écran des membres : une ligne « pending », acceptée par personne, sans date
--       de réponse, écrite par la personne responsable ou par le super-admin ;
--    b. remplacer, par le même écran : l'invitation en attente pour cette adresse, échue ou non,
--       passe de « pending » à « cancelled », datée `now()`, puis a. ;
--    c. annuler, par le même écran : « pending » vers « cancelled », datée `now()` ;
--    d. accepter, par l'écran des organisations : « pending » vers « accepted », datée `now()`, par
--       la personne à qui l'invitation est adressée, reconnue par son adresse et sans contexte
--       d'organisation, à son propre nom (`accepted_by` = `jadwal.current_user_id()`) ;
--    e. la consommation par l'adhésion (migration 0029) : « accepted » vers « joined », sous le rôle
--       qui insère l'adhésion, la personne elle-même, le super-admin ou le propriétaire ;
--    f. la consommation à l'acceptation (point 2) : la base récrit « accepted » en « joined » ;
--    g. la suppression d'un compte : la clé étrangère vide `accepted_by` (`on delete set null`).
--       PostgreSQL exécute cette action sous le propriétaire de la table, quel que soit le rôle qui
--       supprime le compte ;
--    h. le report de l'échéance par le super-admin (ADR 0025) : ni le statut, ni `accepted_by`, ni
--       la date de réponse ne changent ;
--    i. les écritures du propriétaire sous son drapeau d'entretien : la consommation des
--       acceptations déjà écrites (point 4), les données de test. Ses purges suppriment des lignes
--       sans en modifier aucune ; celle des comptes vide `accepted_by` par g ;
--    j. la restauration d'une sauvegarde : `pg_restore` charge les lignes avant de recréer les
--       déclencheurs, qui ne jugent donc aucune ligne restaurée. Une restauration des seules
--       données, dans un schéma déjà en place, les rencontre : elle passe `--disable-triggers`.
--    La console du super-admin n'écrit aucune invitation. La suppression d'une organisation emporte
--    ses invitations par la cascade, sans les modifier.
--
--    Tout le reste est refusé :
--    - une invitation naît « pending », acceptée par personne, sans date de réponse ;
--    - « pending » ne va que vers « accepted » ou « cancelled » ;
--    - « accepted » ne va que vers « joined » ;
--    - « joined » et « cancelled » ne bougent plus ;
--    - le passage à « accepted » n'est permis qu'à la personne à qui l'invitation est adressée, à son
--      propre nom : `accepted_by` vaut `jadwal.current_user_id()`, et ce compte porte l'adresse de
--      l'invitation ;
--    - `accepted_by` ne se remplit qu'à ce passage, ne change jamais de mains, et ne se vide que sous
--      le propriétaire de la table, c'est-à-dire par la clé étrangère quand un compte est supprimé ;
--    - `resolved_at` prend l'heure de la transaction au passage qui quitte « pending », et ne change
--      plus ensuite.
--    Seul le propriétaire, sous son drapeau d'entretien, sort de ces règles (ADR 0019). Le drapeau
--    seul ne suffit pas : tout rôle peut poser ce réglage pour lui-même.
--
--    Le super-admin les suit. Il a tous les droits sur les données (ADR 0025), mais une règle
--    d'intégrité n'est pas un droit de lecture ou d'écriture : elle dit ce que veut dire une ligne.
--    « accepted » veut dire que la personne a accepté. Ces règles ne lui retirent rien : tout ce
--    qu'un passage refusé lui donnerait, il l'obtient par un geste permis, une nouvelle invitation ou
--    une adhésion qu'il crée lui-même (migration 0033). Et elles l'arrêtent sur la méprise, comme le
--    contexte : un `update` sans filtre ne rend pas la vie aux invitations annulées d'une
--    organisation. Il garde les droits de colonne de la migration 0056 : il peut encore changer
--    l'adresse, le rôle ou la fin d'une invitation, tant qu'il ne touche ni au statut, ni à
--    `accepted_by`, ni à la date de réponse.
--
--    Un déclencheur, pour les raisons de la migration 0057 : il tient quelle que soit la branche de
--    politique qui laisse passer la ligne, et il nomme son refus (`restrict_violation`, avec un
--    message qui dit la règle). Il ne lit que la ligne, le compte de l'appelant et le propriétaire de
--    la table.
--
--    L'ordre des déclencheurs. PostgreSQL exécute les déclencheurs d'un même moment dans l'ordre de
--    leurs noms. Avant une modification : `invitation_refuses_expired_acceptance` (0057), puis
--    `invitation_status_moves_forward`, puis `invitation_to_member_is_consumed`. Une invitation échue
--    est refusée avec son motif à elle. Le contrôle lit le passage que l'appelant demande, avant que
--    la consommation ne récrive « accepted » en « joined » : dans l'autre ordre, il lirait
--    « pending » vers « joined », et refuserait l'acceptation d'une personne déjà membre.
--
--    Deux gestes que suivait la version précédente de ce fichier ne sont plus permis aux rôles de
--    connexion, et n'ont donc plus à être consommés : le changement de mains d'une acceptation, et
--    l'insertion d'une invitation déjà acceptée. Le déclencheur de consommation ne suit plus que le
--    passage à « accepted », et son double à l'insertion est retiré : il ne jouait plus que pour le
--    propriétaire, qui écrit sous son drapeau exactement ce qu'il veut écrire. Le nom d'une
--    acceptation, une fois vidé par la suppression d'un compte, ne se remplit plus du tout, que
--    l'invitation coure encore ou qu'elle soit échue (la migration 0057 le dit aussi).
--
-- 4. Les acceptations déjà écrites. L'écran accepte et adhère dans la même transaction : une
--    invitation restée « accepted » après coup est celle d'une personne qui était déjà membre,
--    qu'elle le soit encore ou qu'elle ait été retirée depuis, ou dont le compte a été supprimé.
--    Aucune n'attend une adhésion à venir. Elles passent toutes à « joined ». Leur date de réponse ne
--    change pas : la purge des invitations résolues les emporte au même jour qu'avant.
--
-- Ce qui tient, pour les rôles de connexion : une invitation consommée ne sert plus, une invitation
-- annulée ne s'accepte plus, une acceptation est faite par la personne à qui l'invitation est
-- adressée et ne passe à personne d'autre, une invitation échue ne s'accepte pas (0057), une
-- invitation résolue garde sa date de réponse, et une adhésion née d'une invitation porte le rôle de
-- celle-ci.
--
-- Limite. Pour le rôle applicatif, la base ne sépare pas l'éditeur du responsable à l'intérieur d'une
-- organisation : toute personne qui a le contexte de l'organisation peut, par un appel direct,
-- s'écrire une invitation, de n'importe quel rôle, à sa propre adresse, l'accepter et adhérer avec ce
-- rôle, comme elle peut changer le rôle d'une adhésion, le sien compris (migration 0053). C'est
-- l'écran des membres qui réserve ces gestes aux personnes responsables. Le fermer dans la base est
-- une décision du modèle de sécurité, qui n'est pas prise ici.
--
-- Ce fichier n'avait encore été appliqué à aucune base en service : il est corrigé en place plutôt
-- que suivi d'un 0059 qui retirerait ce qu'il vient de poser. Une base de développement qui a déjà
-- appliqué sa version précédente le rejoue à la main : il est rejouable, et retire lui-même le
-- déclencheur d'insertion de cette version.
--
-- Au rejeu, les migrations 0024, 0026 et 0057 remettent la fonction à deux arguments, et 0024 la
-- politique qui l'appelle. Celle-ci les remplace juste après, puis retire l'ancienne fonction :
-- l'ordre des fichiers suffit, les fichiers anciens restent tels qu'ils ont été appliqués.
--
-- La politique est redite dans le schéma (`src/schema/index.ts`), et `meta/0058_snapshot.json` est
-- l'instantané que Drizzle Kit produit pour elle : une prochaine génération part de là, et ne
-- réécrit pas la politique sans l'invitation.

-- 1. La fonction que lit la politique d'adhésion, avec le rôle. Tout le reste est repris de 0057 à
--    l'identique : les droits du définisseur, le chemin de recherche figé, l'échéance ; puis les
--    droits de 0024, redits pour que le fichier se suffise. Le troisième paramètre ne s'appelle pas
--    `role` : dans une fonction SQL, le nom d'une colonne l'emporterait sur celui du paramètre.
CREATE OR REPLACE FUNCTION "jadwal"."invited"(organisation uuid, personne uuid, role_demande text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
	SELECT EXISTS (
		SELECT 1 FROM public."invitation" i
		WHERE i."organization_id" = organisation
			AND i."accepted_by" = personne
			AND i."status" = 'accepted'
			AND i."expires_at" > now()
			AND i."role" = role_demande
	)
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."invited"(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."invited"(uuid, uuid, text) TO "jadwal_app";
--> statement-breakpoint
DROP POLICY IF EXISTS "membership_insert" ON "membership";
--> statement-breakpoint
CREATE POLICY "membership_insert" ON "membership"
	AS PERMISSIVE FOR INSERT TO "jadwal_app"
	WITH CHECK (
		"organization_id" = (select jadwal.current_org_id())
		AND "user_id" = (select jadwal.current_user_id())
		AND jadwal.invited("organization_id", "user_id", "role")
	);
--> statement-breakpoint
-- Plus rien ne l'appelle : une fonction à droits du définisseur qui traîne est une porte de plus.
DROP FUNCTION IF EXISTS "jadwal"."invited"(uuid, uuid);
--> statement-breakpoint

-- 2. L'acceptation par une personne déjà membre consomme l'invitation. Aux droits de l'appelant,
--    comme le déclencheur de 0029 : il ne doit voir que ce que l'appelant voit.
CREATE OR REPLACE FUNCTION "jadwal"."consume_invitation_to_member"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN
	IF EXISTS (
		SELECT 1 FROM public."membership" m
		WHERE m."organization_id" = NEW."organization_id" AND m."user_id" = NEW."accepted_by"
	) THEN
		NEW."status" := 'joined';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."consume_invitation_to_member"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "invitation_to_member_is_consumed" ON "invitation";
--> statement-breakpoint
-- Le passage à « accepted », et lui seul : depuis le point 3, aucun autre geste ne nomme une personne.
CREATE TRIGGER "invitation_to_member_is_consumed"
	BEFORE UPDATE ON "invitation"
	FOR EACH ROW
	WHEN (NEW."status" = 'accepted' AND NEW."accepted_by" IS NOT NULL
		AND OLD."status" IS DISTINCT FROM NEW."status")
	EXECUTE FUNCTION "jadwal"."consume_invitation_to_member"();
--> statement-breakpoint
-- La version précédente de ce fichier le posait. Une invitation naît désormais « pending » (point 3).
DROP TRIGGER IF EXISTS "invitation_to_member_is_consumed_at_insert" ON "invitation";
--> statement-breakpoint

-- 3. Les passages de statut. Aux droits de l'appelant : il lit le compte de l'appelant comme le
--    font déjà les politiques de l'invitation, sans rien emprunter à personne.
CREATE OR REPLACE FUNCTION "jadwal"."refuse_invitation_status_change"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	proprietaire boolean;
BEGIN
	proprietaire := current_user = (
		SELECT pg_get_userbyid(c."relowner") FROM pg_class c WHERE c."oid" = TG_RELID
	);
	-- Le propriétaire, sous son drapeau d'entretien, sort de ces règles. Le drapeau est lu par la
	-- fonction de 0007, que seul le propriétaire peut appeler : d'où les deux tests imbriqués.
	IF proprietaire THEN
		IF jadwal.maintenance() THEN
			RETURN NEW;
		END IF;
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF NEW."status" <> 'pending' OR NEW."accepted_by" IS NOT NULL
			OR NEW."resolved_at" IS NOT NULL THEN
			RAISE EXCEPTION 'invitation % is created pending, accepted by nobody, not yet answered',
				NEW."id"
				USING ERRCODE = 'restrict_violation';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
		(OLD."status" = 'pending' AND NEW."status" IN ('accepted', 'cancelled'))
		OR (OLD."status" = 'accepted' AND NEW."status" = 'joined')
	) THEN
		RAISE EXCEPTION 'invitation % cannot go from % to %', NEW."id", OLD."status", NEW."status"
			USING ERRCODE = 'restrict_violation';
	END IF;

	-- L'adresse lue est celle à laquelle l'invitation a été envoyée (`OLD`), et non celle que la
	-- ligne prend : le super-admin peut modifier l'adresse, et ne doit pas pouvoir réadresser une
	-- invitation à lui-même pour l'accepter dans la même instruction.
	IF OLD."status" = 'pending' AND NEW."status" = 'accepted' THEN
		IF NEW."accepted_by" IS NULL
			OR NEW."accepted_by" IS DISTINCT FROM jadwal.current_user_id()
			OR NOT EXISTS (
				SELECT 1 FROM public."user" u
				WHERE u."id" = NEW."accepted_by" AND lower(u."email") = lower(OLD."email")
			) THEN
			RAISE EXCEPTION 'invitation % is accepted only by the person it was sent to, in her own name',
				NEW."id"
				USING ERRCODE = 'restrict_violation';
		END IF;
	ELSIF NEW."accepted_by" IS DISTINCT FROM OLD."accepted_by" THEN
		IF NEW."accepted_by" IS NOT NULL THEN
			RAISE EXCEPTION 'invitation % is accepted once, and its acceptance never changes hands',
				NEW."id"
				USING ERRCODE = 'restrict_violation';
		END IF;
		-- Le retour à vide : la clé étrangère, qui tourne sous le propriétaire de la table.
		IF NOT proprietaire THEN
			RAISE EXCEPTION 'the acceptance of invitation % is emptied only when the account is deleted',
				NEW."id"
				USING ERRCODE = 'restrict_violation';
		END IF;
	END IF;

	-- La date de réponse : l'heure de la transaction qui répond, au passage qui quitte « pending »,
	-- comme l'écrivent les écrans, puis plus rien. `now()` est la même pour toute la transaction.
	IF OLD."status" = 'pending' AND NEW."status" <> 'pending' THEN
		IF NEW."resolved_at" IS DISTINCT FROM now() THEN
			RAISE EXCEPTION 'invitation % is dated once, at the time of its answer', NEW."id"
				USING ERRCODE = 'restrict_violation';
		END IF;
	ELSIF NEW."resolved_at" IS DISTINCT FROM OLD."resolved_at" THEN
		RAISE EXCEPTION 'invitation % is dated once, at the time of its answer', NEW."id"
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."refuse_invitation_status_change"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "invitation_status_moves_forward" ON "invitation";
--> statement-breakpoint
CREATE TRIGGER "invitation_status_moves_forward"
	BEFORE UPDATE ON "invitation"
	FOR EACH ROW
	WHEN (OLD."status" IS DISTINCT FROM NEW."status"
		OR OLD."accepted_by" IS DISTINCT FROM NEW."accepted_by"
		OR OLD."resolved_at" IS DISTINCT FROM NEW."resolved_at")
	EXECUTE FUNCTION "jadwal"."refuse_invitation_status_change"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "invitation_status_starts_pending" ON "invitation";
--> statement-breakpoint
CREATE TRIGGER "invitation_status_starts_pending"
	BEFORE INSERT ON "invitation"
	FOR EACH ROW
	WHEN (NEW."status" <> 'pending' OR NEW."accepted_by" IS NOT NULL
		OR NEW."resolved_at" IS NOT NULL)
	EXECUTE FUNCTION "jadwal"."refuse_invitation_status_change"();
--> statement-breakpoint

-- 4. Les acceptations déjà écrites, consommées. Le propriétaire n'écrit dans `invitation` que sous
--    son drapeau d'entretien : il le pose le temps de l'écriture, puis rend au drapeau la valeur
--    qu'il avait, pour que la suite de la transaction tourne comme avant. La preuve suit, dans la
--    même transaction : sans elle, une politique manquante rendrait « 0 ligne » en silence.
DO $consomme$
DECLARE
	avant text := coalesce(current_setting('jadwal.maintenance', true), '');
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	UPDATE public."invitation" SET "status" = 'joined' WHERE "status" = 'accepted';
	IF EXISTS (SELECT 1 FROM public."invitation" WHERE "status" = 'accepted') THEN
		RAISE EXCEPTION 'invitation : une acceptation reste non consommée';
	END IF;
	PERFORM set_config('jadwal.maintenance', avant, true);
END
$consomme$;
--> statement-breakpoint

-- 5. La preuve, dans la même transaction.
DO $verifie$
DECLARE
	role_name text;
	ordre text[];
BEGIN
	IF to_regprocedure('jadwal.invited(uuid, uuid)') IS NOT NULL THEN
		RAISE EXCEPTION 'jadwal.invited : l''ancienne fonction, sans le rôle, existe encore';
	END IF;
	IF pg_get_functiondef('jadwal.invited(uuid, uuid, text)'::regprocedure)
		NOT LIKE '%i."role" = role_demande%'
		OR pg_get_functiondef('jadwal.invited(uuid, uuid, text)'::regprocedure)
		NOT LIKE '%i."expires_at" > now()%' THEN
		RAISE EXCEPTION 'jadwal.invited : le rôle ou l''échéance n''est pas lu';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'jadwal' AND p.proname = 'invited' AND p.prosecdef
			AND p.proconfig IS NOT NULL
	) THEN
		RAISE EXCEPTION 'jadwal.invited : doit rester à droits du définisseur, chemin figé';
	END IF;
	IF NOT has_function_privilege('jadwal_app', 'jadwal.invited(uuid, uuid, text)', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.invited : le rôle applicatif ne peut pas l''appeler';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'membership' AND policyname = 'membership_insert'
			AND roles = ARRAY['jadwal_app']::name[] AND cmd = 'INSERT'
			AND with_check LIKE '%jadwal.invited(organization_id, user_id, role)%'
	) THEN
		RAISE EXCEPTION 'membership_insert : la politique ne passe pas le rôle à jadwal.invited';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger tg
		JOIN pg_proc p ON p.oid = tg.tgfoid
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE tg.tgrelid = 'public.invitation'::regclass
			AND tg.tgname = 'invitation_to_member_is_consumed'
			AND tg.tgenabled = 'O'
			-- Ligne par ligne (1), avant (2), sur modification (16).
			AND (tg.tgtype::int & 19) = 19
			AND n.nspname = 'jadwal' AND p.proname = 'consume_invitation_to_member'
	) THEN
		RAISE EXCEPTION 'invitation : le déclencheur de consommation manque ou ne tire pas';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_trigger tg
		WHERE tg.tgrelid = 'public.invitation'::regclass
			AND tg.tgname = 'invitation_to_member_is_consumed_at_insert'
	) THEN
		RAISE EXCEPTION 'invitation : l''ancien déclencheur de consommation à l''insertion existe encore';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'jadwal' AND p.proname = 'consume_invitation_to_member'
			AND (p.prosecdef OR p.proconfig IS NULL)
	) THEN
		RAISE EXCEPTION 'consume_invitation_to_member : doit rester aux droits de l''appelant, chemin figé';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger tg
		JOIN pg_proc p ON p.oid = tg.tgfoid
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE tg.tgrelid = 'public.invitation'::regclass
			AND tg.tgname = 'invitation_status_moves_forward'
			AND tg.tgenabled = 'O'
			AND (tg.tgtype::int & 19) = 19
			AND n.nspname = 'jadwal' AND p.proname = 'refuse_invitation_status_change'
	) THEN
		RAISE EXCEPTION 'invitation : le déclencheur des passages de statut manque ou ne tire pas';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger tg
		JOIN pg_proc p ON p.oid = tg.tgfoid
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE tg.tgrelid = 'public.invitation'::regclass
			AND tg.tgname = 'invitation_status_starts_pending'
			AND tg.tgenabled = 'O'
			-- Ligne par ligne (1), avant (2), sur insertion (4).
			AND (tg.tgtype::int & 7) = 7
			AND n.nspname = 'jadwal' AND p.proname = 'refuse_invitation_status_change'
	) THEN
		RAISE EXCEPTION 'invitation : le déclencheur de naissance manque ou ne tire pas';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'jadwal' AND p.proname = 'refuse_invitation_status_change'
			AND (p.prosecdef OR p.proconfig IS NULL)
	) THEN
		RAISE EXCEPTION 'refuse_invitation_status_change : doit rester aux droits de l''appelant, chemin figé';
	END IF;

	-- L'ordre porte le sens : l'échéance, puis les passages, puis la consommation. Il suit les noms,
	-- que `pg_trigger` classe octet par octet.
	SELECT array_agg(tg.tgname::text ORDER BY tg.tgname) INTO ordre
	FROM pg_trigger tg
	WHERE tg.tgrelid = 'public.invitation'::regclass AND NOT tg.tgisinternal
		AND (tg.tgtype::int & 19) = 19;
	IF array_position(ordre, 'invitation_refuses_expired_acceptance') IS NULL
		OR array_position(ordre, 'invitation_status_moves_forward') IS NULL
		OR array_position(ordre, 'invitation_to_member_is_consumed') IS NULL
		OR NOT (array_position(ordre, 'invitation_refuses_expired_acceptance')
				< array_position(ordre, 'invitation_status_moves_forward')
			AND array_position(ordre, 'invitation_status_moves_forward')
				< array_position(ordre, 'invitation_to_member_is_consumed')) THEN
		RAISE EXCEPTION 'invitation : les déclencheurs ne passent pas dans l''ordre attendu (%)', ordre;
	END IF;

	FOREACH role_name IN ARRAY ARRAY['jadwal_app', 'jadwal_superadmin', 'jadwal_auth',
		'jadwal_public'] LOOP
		IF has_function_privilege(role_name, 'jadwal.consume_invitation_to_member()', 'EXECUTE') THEN
			RAISE EXCEPTION 'consume_invitation_to_member : % peut l''appeler', role_name;
		END IF;
		IF has_function_privilege(role_name, 'jadwal.refuse_invitation_status_change()', 'EXECUTE') THEN
			RAISE EXCEPTION 'refuse_invitation_status_change : % peut l''appeler', role_name;
		END IF;
	END LOOP;
END
$verifie$;
