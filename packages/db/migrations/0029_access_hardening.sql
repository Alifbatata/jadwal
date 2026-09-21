-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Corrections d'une revue d'évasion : six écarts entre ce que les décisions annoncent et ce que la
-- base permettait réellement.
--
-- Deux retouches datent de l'étape 4, et elles disent la même chose de deux façons : un fichier
-- rejouable ne peut pas défaire ce qu'une migration plus récente a décidé.
--   Sa première section est devenue conditionnelle, parce que la migration 0035 supprime
--   `support_access` : un fichier qui la nomme sans garde cesserait d'être rejouable le jour suivant.
--   Ses sections 2 et 7 ont été retirées, parce que la migration 0033 les renverse (ADR 0025) :
--   le super-admin lit de nouveau les adhésions, et il écrit au journal autre chose que du support.
--   Les rejouer défaisait 0033 à chaque fois. L'état final d'une base neuve est le même qu'avant,
--   puisque 0033 recrée exactement ce qu'elles retiraient ; git garde leur texte.
-- Le reste doit rester rejouable : il porte des durcissements — droits colonne par colonne,
-- déclencheurs — que rejouer les migrations plus anciennes défait.

-- 1. L'accès de support ne se prolonge pas, et ne se rouvre pas (ADR 0018).
--    La contrainte bornait `expires_at` par rapport à `opened_at`, mais `opened_at` était modifiable :
--    il suffisait de l'avancer pour repousser la fin, indéfiniment. Et une fenêtre révoquée pouvait
--    être dé-révoquée. Le droit de modification est donc réduit à la seule colonne de révocation,
--    et un déclencheur interdit d'y revenir en arrière.
DO $fenetre$
BEGIN
	IF to_regclass('public.support_access') IS NULL THEN RETURN; END IF;
	EXECUTE 'REVOKE UPDATE ON public."support_access" FROM "jadwal_superadmin"';
	EXECUTE 'GRANT UPDATE ("revoked_at") ON public."support_access" TO "jadwal_superadmin"';
	EXECUTE $fn$
		CREATE OR REPLACE FUNCTION "jadwal"."support_access_is_final"() RETURNS trigger
		LANGUAGE plpgsql SET search_path = public, pg_temp
		AS $corps$
		BEGIN
			IF NEW."opened_at" IS DISTINCT FROM OLD."opened_at"
				OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
				OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
				OR NEW."reason" IS DISTINCT FROM OLD."reason" THEN
				RAISE EXCEPTION 'a support window is never rewritten: open a new one'
					USING ERRCODE = 'restrict_violation';
			END IF;
			IF OLD."revoked_at" IS NOT NULL AND NEW."revoked_at" IS NULL THEN
				RAISE EXCEPTION 'a revoked support window is never reopened'
					USING ERRCODE = 'restrict_violation';
			END IF;
			RETURN NEW;
		END
		$corps$;
	$fn$;
	EXECUTE 'REVOKE ALL ON FUNCTION "jadwal"."support_access_is_final"() FROM PUBLIC';
	EXECUTE 'DROP TRIGGER IF EXISTS "support_access_final" ON public."support_access"';
	EXECUTE 'CREATE TRIGGER "support_access_final" BEFORE UPDATE ON public."support_access"
		FOR EACH ROW EXECUTE FUNCTION "jadwal"."support_access_is_final"()';
END
$fenetre$;
--> statement-breakpoint

-- 3. Le rôle de connexion ne peut plus faire de quiconque un super-admin (ADR 0016).
--    Il avait le droit de modifier toutes les colonnes de la table des comptes, y compris le
--    drapeau que l'application relit à chaque requête pour ouvrir l'administration.
REVOKE UPDATE ON "user" FROM "jadwal_auth";
--> statement-breakpoint
GRANT UPDATE ("email", "name", "email_verified", "image", "updated_at") ON "user" TO "jadwal_auth";
--> statement-breakpoint
REVOKE INSERT ON "user" FROM "jadwal_auth";
--> statement-breakpoint
GRANT INSERT ("id", "email", "name", "email_verified", "image", "created_at", "updated_at")
	ON "user" TO "jadwal_auth";
--> statement-breakpoint

-- 4. Une invitation acceptée ne vaut qu'une fois (ADR 0017).
--    Elle restait un billet permanent : une personne retirée d'une organisation pouvait s'y
--    réinscrire, puisque la fonction ne regardait que l'acceptation passée. L'adhésion créée marque
--    donc l'invitation comme consommée, par un déclencheur, et non par la bonne volonté du code.
-- Aux droits de l'appelant : à droits du définisseur, la mise à jour tournerait sous le
-- propriétaire, dont la politique d'écriture sur les invitations exige son drapeau d'entretien, et
-- elle ne toucherait aucune ligne — en silence, comme toujours avec un `update` refusé.
CREATE OR REPLACE FUNCTION "jadwal"."consume_invitation"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN
	UPDATE public."invitation"
	SET "status" = 'joined'
	WHERE "organization_id" = NEW."organization_id"
		AND "accepted_by" = NEW."user_id"
		AND "status" = 'accepted';
	RETURN NEW;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."consume_invitation"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "membership_consumes_invitation" ON "membership";
--> statement-breakpoint
CREATE TRIGGER "membership_consumes_invitation" AFTER INSERT ON "membership"
	FOR EACH ROW EXECUTE FUNCTION "jadwal"."consume_invitation"();
--> statement-breakpoint

-- 5. Une invitation ne se réécrit pas par la personne invitée (ADR 0017).
--    La branche « mon adresse » lui laissait changer le rôle de sa propre invitation : une
--    invitation d'éditeur devenait une invitation de responsable. Le droit de modification est
--    réduit aux trois colonnes de la réponse.
REVOKE UPDATE ON "invitation" FROM "jadwal_app";
--> statement-breakpoint
GRANT UPDATE ("status", "accepted_by", "resolved_at") ON "invitation" TO "jadwal_app";
--> statement-breakpoint

-- 6. Le propriétaire ne lit pas le journal d'audit (ADR 0020).
--    La boucle des politiques d'entretien lui en avait donné une : il supprime sans lire, et c'est
--    ce qui fait que la purge n'est pas un chemin détourné vers le contenu des organisations.
DROP POLICY IF EXISTS "audit_log_owner_select" ON "audit_log";
