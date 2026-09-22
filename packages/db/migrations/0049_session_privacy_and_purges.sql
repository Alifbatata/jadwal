-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
--
-- Trois trous de rétention, trouvés en confrontant `docs/CONDITIONS.md` au schéma (étape 13).
--
-- Le document promet des durées et affirme que l'adresse électronique est la seule donnée
-- personnelle du service. Le schéma disait autre chose :
--
--   1. `session` porte `ip_address` et `user_agent`, écrits par Better Auth à chaque connexion,
--      mentionnés dans aucun document, et **qu'aucune purge n'efface**. Le durcissement de l'étape 9
--      les a même rendus exacts : en déclarant les mandataires de confiance, on a appris à Better
--      Auth à résoudre la vraie adresse du visiteur au lieu de retomber sur un seau partagé ;
--   2. **aucune purge n'efface une session**. Better Auth ne supprime une session expirée que
--      lorsque son jeton lui est représenté ; un navigateur qu'on ferme laisse sa ligne pour
--      toujours. Cette ligne fantôme bloque en outre `purge_orphan_accounts`, qui exige
--      `NOT EXISTS (session)` : les deux défauts se renforçaient ;
--   3. `verification.value` range l'adresse électronique **en clair** — c'est Better Auth qui l'y
--      écrit, `JSON.stringify({ email, name })`, et les options `storeToken` et `storeIdentifier`
--      ne couvrent que l'identifiant, jamais la valeur. La ligne part quand le lien est cliqué. Un
--      lien qu'on ne clique pas laisse l'adresse en base sans limite de temps.
--
-- S'y ajoute une invitation jamais acceptée : `purge_resolved_invitations` ne visait que
-- `status <> 'pending'`. Une invitation en attente et expirée n'était plus listée par l'écran des
-- membres — donc plus personne ne pouvait l'annuler — et rien ne l'effaçait.

-- 1. Ce qui a déjà été écrit. On l'efface, et on le prouve dans la même transaction : sans la
--    preuve, une politique manquante rendrait « 0 ligne » en silence, et l'on croirait avoir nettoyé.
DO $efface$
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	UPDATE public."session" SET "ip_address" = NULL, "user_agent" = NULL
	WHERE "ip_address" IS NOT NULL OR "user_agent" IS NOT NULL;
	IF EXISTS (
		SELECT 1 FROM public."session"
		WHERE coalesce("ip_address", '') <> '' OR coalesce("user_agent", '') <> ''
	) THEN
		RAISE EXCEPTION 'session : une adresse ou un navigateur subsiste après effacement';
	END IF;
END
$efface$;
--> statement-breakpoint

-- 2. Les sessions expirées. La borne est l'expiration elle-même, et non une durée de plus : une
--    session dont la date est passée ne sert plus à rien, et elle porte un jeton.
--
--    **Il faut retirer la politique de suppression d'entretien, sans quoi la borne ne borne rien.**
--    Les politiques permissives se cumulent en OU (ADR 0013) : tant que `session_owner_delete`
--    existe, le propriétaire sous son drapeau peut effacer n'importe quelle session, et la purge
--    — qui tourne justement sous ce drapeau — emporterait tout le monde. C'est ce qu'un premier jet
--    de cette migration a fait, et c'est le test qui l'a montré.
--
--    C'est la même disposition que pour `audit_log` (migration 0007, qui saute ses `update` et
--    `delete`) et que pour `admin_access_log` (migration 0039, qui retire la sienne) : une table dont
--    la rétention doit résister au propriétaire lui-même n'a qu'une seule porte de sortie, et elle
--    est bornée.
DROP POLICY IF EXISTS "session_owner_delete" ON "session";
--> statement-breakpoint
DROP POLICY IF EXISTS "session_owner_purge" ON "session";
--> statement-breakpoint
CREATE POLICY "session_owner_purge" ON "session"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING ("expires_at" < now());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."purge_expired_sessions"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."session";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_expired_sessions"() FROM PUBLIC;
--> statement-breakpoint
-- Le propriétaire doit pouvoir **lire** ce qu'il purge : sans lecture, la suppression ne verrait
-- aucune ligne. Sa politique de lecture d'entretien existe déjà (migration 0007) et suffit — celle-ci
-- n'ouvre rien de plus, elle rend la purge indépendante du drapeau pour la seule lecture des lignes
-- expirées.
DROP POLICY IF EXISTS "session_owner_purge_select" ON "session";
--> statement-breakpoint
CREATE POLICY "session_owner_purge_select" ON "session"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner"
	USING ("expires_at" < now());
--> statement-breakpoint

-- 3. Les vérifications expirées. Même raisonnement, et une raison de plus : leur `value` porte une
--    adresse électronique en clair.
DROP POLICY IF EXISTS "verification_owner_delete" ON "verification";
--> statement-breakpoint
DROP POLICY IF EXISTS "verification_owner_purge" ON "verification";
--> statement-breakpoint
CREATE POLICY "verification_owner_purge" ON "verification"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING ("expires_at" < now());
--> statement-breakpoint
DROP POLICY IF EXISTS "verification_owner_purge_select" ON "verification";
--> statement-breakpoint
CREATE POLICY "verification_owner_purge_select" ON "verification"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner"
	USING ("expires_at" < now());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."purge_expired_verifications"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."verification";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_expired_verifications"() FROM PUBLIC;
--> statement-breakpoint

-- 4. Les invitations qui ne sont plus en cours, quelle qu'en soit la raison.
--
--    L'ancienne procédure ne visait que `status <> 'pending'`. Une invitation en attente dont la
--    date est passée n'est plus listée par l'écran des membres, qui filtre sur `expires_at > now()` :
--    plus personne ne pouvait l'annuler, et rien ne l'effaçait. Son adresse restait pour toujours.
--
--    La borne est la même dans les deux cas : quatre-vingt-dix jours après que l'invitation a cessé
--    d'être en cours.
CREATE OR REPLACE FUNCTION "jadwal"."purge_resolved_invitations"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	DELETE FROM public."invitation"
	WHERE (
		("status" <> 'pending' AND coalesce("resolved_at", "created_at") < now() - interval '90 days')
		OR ("status" = 'pending' AND "expires_at" < now() - interval '90 days')
	);
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_resolved_invitations"() FROM PUBLIC;
