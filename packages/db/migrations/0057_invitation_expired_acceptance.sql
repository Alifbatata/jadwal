-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une invitation échue ne s'accepte plus, même par un appel direct (ADR 0017).
--
-- L'écran d'acceptation filtre `expires_at > now()`, mais rien dans la base ne le faisait : la
-- politique de modification d'`invitation` reconnaît la personne invitée par son adresse, sans
-- regarder l'échéance, et `jadwal.invited`, que lit la politique d'adhésion, ne regardait que le
-- statut. Un `update` tapé à la main acceptait donc une invitation échue, et l'adhésion suivait.
--
-- 1. Un déclencheur refuse qu'une invitation échue passe à « accepted », et qu'une acceptation
--    échue change de mains. Un déclencheur plutôt qu'une politique, pour trois raisons :
--    - il tient quels que soient le rôle et la branche de politique qui laissent passer la ligne :
--      la personne invitée par son adresse, la personne responsable par le contexte, le super-admin.
--      Une politique devrait répéter la condition sur chaque branche et pour chaque rôle, et en
--      oublier une rouvrirait le chemin ;
--    - il nomme son refus. Une politique refusée dit seulement « row-level security policy »,
--      comme un refus d'isolation ; le déclencheur lève `restrict_violation` avec un message qui
--      dit que l'invitation est échue, comme celui qui protège la dernière personne responsable
--      (migration 0012) ;
--    - il ne lit que la ligne et l'horloge : aucune table, donc aucune récursion, alors que la
--      chaîne `invitation` → `user` → `membership` a déjà imposé une fonction à droits du
--      définisseur à la politique d'adhésion (migration 0024).
--    L'insertion n'a pas besoin du déclencheur : `created_at` est posé par le serveur (migration
--    0056) et `expires_at > created_at`, donc une invitation n'est jamais échue au moment où on la
--    crée. Seul le propriétaire peut dater autrement, sous son drapeau, et il est de confiance par
--    construction (ADR 0019) ;
-- 2. `jadwal.invited` exige aussi l'échéance : une invitation acceptée à temps, puis échue avant
--    l'adhésion, n'ouvre plus rien. L'écran accepte et rejoint dans la même transaction, où `now()`
--    ne bouge pas : rien ne change pour lui.
--
-- Au rejeu, la migration 0026 remet l'ancienne définition de `jadwal.invited`, et celle-ci la
-- remplace juste après : l'ordre des fichiers suffit, 0026 reste telle qu'elle a été appliquée.

-- 1. Le déclencheur. Aux droits de l'appelant : il ne lit aucune table, il n'a rien à emprunter à
--    personne.
CREATE OR REPLACE FUNCTION "jadwal"."refuse_expired_acceptance"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN
	IF NEW."expires_at" <= now() THEN
		RAISE EXCEPTION 'invitation % has expired and cannot be accepted', NEW."id"
			USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."refuse_expired_acceptance"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "invitation_refuses_expired_acceptance" ON "invitation";
--> statement-breakpoint
-- Deux gestes sont visés : le passage à « accepted », et le changement de mains vers une personne.
-- Le retour à vide ne l'est pas : quand un compte est supprimé, la clé étrangère vide `accepted_by`
-- (`on delete set null`), et le refuser empêchait de supprimer le compte qui porte une acceptation
-- échue. La purge des comptes, une seule instruction pour tous, échouait alors en entier. Cet état
-- naissait d'un parcours ordinaire : une personne déjà membre acceptait une nouvelle invitation,
-- l'adhésion existait déjà, et rien ne consommait l'invitation. Depuis la migration 0058, cette
-- acceptation consomme l'invitation : l'état ne naît plus que d'un appel direct qui accepte sans
-- adhérer. Une fois vide, le nom d'une invitation échue ne se remplit plus, et depuis la migration
-- 0058 celui d'aucune invitation : une acceptation ne change jamais de mains.
--
-- `NEW."expires_at"` est la fin de la ligne qui sort, et c'est elle qui compte, pas celle qu'avait la
-- ligne. Ce choix ne décide que des instructions qui changent la fin et l'acceptation ensemble :
-- repousser la fin et accepter d'un même geste passe ; avancer la fin dans le passé et changer le nom
-- d'un même geste est refusé. Repousser puis accepter, en deux instructions, passe de toute façon :
-- quand vient l'acceptation, la fin est déjà repoussée. Le super-admin a tous les droits sur les
-- données (ADR 0025), et repousser une échéance est une modification ordinaire : il peut donc rendre
-- la vie à une invitation échue qui a duré moins de quatorze jours, en repoussant sa fin jusqu'à
-- quatorze jours après sa création. C'est voulu. La borne de 0056 l'arrête là : une invitation créée
-- il y a plus de quatorze jours ne reprend pas vie. Le passage à « joined », que fait l'adhésion
-- (migration 0029), n'est pas concerné.
--
-- Limite : `now()` est l'heure du début de la transaction, ici comme dans `jadwal.invited`. Une
-- transaction ouverte avant l'échéance et tenue au-delà accepte encore, et l'adhésion suit.
CREATE TRIGGER "invitation_refuses_expired_acceptance"
	BEFORE UPDATE ON "invitation"
	FOR EACH ROW
	WHEN (NEW."status" = 'accepted' AND (OLD."status" IS DISTINCT FROM NEW."status"
		OR (NEW."accepted_by" IS NOT NULL AND OLD."accepted_by" IS DISTINCT FROM NEW."accepted_by")))
	EXECUTE FUNCTION "jadwal"."refuse_expired_acceptance"();
--> statement-breakpoint

-- 2. L'adhésion ne s'ouvre que sur une acceptation qui court encore. Tout le reste de la définition
--    est repris de 0026 à l'identique : la signature, les droits du définisseur, le chemin de
--    recherche figé ; puis les droits de 0024, redits pour que le fichier se suffise. La migration
--    0058 la remplace par une fonction qui reçoit aussi le rôle de l'adhésion.
CREATE OR REPLACE FUNCTION "jadwal"."invited"(organisation uuid, personne uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
	SELECT EXISTS (
		SELECT 1 FROM public."invitation" i
		WHERE i."organization_id" = organisation
			AND i."accepted_by" = personne
			AND i."status" = 'accepted'
			AND i."expires_at" > now()
	)
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."invited"(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."invited"(uuid, uuid) TO "jadwal_app";
--> statement-breakpoint

-- 3. La preuve, dans la même transaction.
DO $verifie$
DECLARE
	role_name text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger tg
		JOIN pg_proc p ON p.oid = tg.tgfoid
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE tg.tgrelid = 'public.invitation'::regclass
			AND tg.tgname = 'invitation_refuses_expired_acceptance'
			AND tg.tgenabled = 'O'
			-- Ligne par ligne (1), avant (2), sur modification (16).
			AND (tg.tgtype::int & 19) = 19
			AND n.nspname = 'jadwal' AND p.proname = 'refuse_expired_acceptance'
	) THEN
		RAISE EXCEPTION 'invitation : le déclencheur d''échéance manque ou ne tire pas';
	END IF;

	IF EXISTS (
		SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'jadwal' AND p.proname = 'refuse_expired_acceptance'
			AND (p.prosecdef OR p.proconfig IS NULL)
	) THEN
		RAISE EXCEPTION 'refuse_expired_acceptance : doit rester aux droits de l''appelant, chemin figé';
	END IF;

	FOREACH role_name IN ARRAY ARRAY['jadwal_app', 'jadwal_superadmin', 'jadwal_auth',
		'jadwal_public'] LOOP
		IF has_function_privilege(role_name, 'jadwal.refuse_expired_acceptance()', 'EXECUTE') THEN
			RAISE EXCEPTION 'refuse_expired_acceptance : % peut l''appeler', role_name;
		END IF;
	END LOOP;

	IF pg_get_functiondef('jadwal.invited(uuid, uuid)'::regprocedure)
		NOT LIKE '%i."expires_at" > now()%' THEN
		RAISE EXCEPTION 'jadwal.invited : l''échéance n''est pas lue';
	END IF;
	IF NOT has_function_privilege('jadwal_app', 'jadwal.invited(uuid, uuid)', 'EXECUTE') THEN
		RAISE EXCEPTION 'jadwal.invited : le rôle applicatif ne peut plus l''appeler';
	END IF;
END
$verifie$;
