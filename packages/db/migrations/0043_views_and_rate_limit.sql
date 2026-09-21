-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Ce que Drizzle Kit n'émet pas pour l'étape 7 : les droits du compteur de vues, sa rétention, et
-- la correction du limiteur de débit.

-- 1. Le compteur de vues (ADR 0032). La sécurité au niveau des lignes est forcée comme partout ;
--    Drizzle ne sait émettre que le `ENABLE`.
ALTER TABLE "page_view" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. `fillfactor` à 70 : la ligne du jour est mise à jour des milliers de fois. En laissant de la
--    place libre sur chaque page, PostgreSQL peut faire une mise à jour « HOT », c'est-à-dire sans
--    créer d'entrée d'index et en récupérant les versions intermédiaires sans VACUUM. C'est ce qui
--    empêche la table de gonfler. La condition est qu'aucune colonne indexée ne change : `count`
--    n'est dans aucun index, et ne doit jamais y entrer.
ALTER TABLE "page_view" SET (fillfactor = 70);
--> statement-breakpoint

-- 3. Les droits. Les responsables **lisent** leurs chiffres et ne les écrivent jamais : un compteur
--    n'est pas une donnée qu'on saisit. Le rôle public, lui, incrémente — et il lui faut la lecture,
--    parce que `count = count + 1` lit la valeur avant de l'écrire.
GRANT SELECT ON "page_view" TO "jadwal_app";
--> statement-breakpoint
-- Le super-admin lit, et rien de plus. La boucle de la migration 0034 accorde les quatre
-- opérations sur toute table portant `organization_id` : `page_view` en porte un, mais un compteur
-- n'est pas une donnée qu'on corrige à la main, et l'ADR 0032 ne lui reconnaît qu'un seul
-- écrivain — l'incrément du rôle public. Le retrait vient donc avant la lecture, et il est
-- indispensable au rejeu : sans lui, la boucle de 0034 rendrait au super-admin trois droits sans
-- politique, ce que le catalogue refuse.
REVOKE ALL ON "page_view" FROM "jadwal_superadmin";
--> statement-breakpoint
GRANT SELECT ON "page_view" TO "jadwal_superadmin";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "page_view" TO "jadwal_public";
--> statement-breakpoint
REVOKE ALL ON "page_view" FROM "jadwal_auth";
--> statement-breakpoint
REVOKE ALL ON "page_view" FROM PUBLIC;
--> statement-breakpoint

-- 4. Les politiques d'entretien du propriétaire, pour la table nouvelle : sans elles, il ne pourrait
--    ni migrer son contenu ni le purger, et un `delete` refusé rendrait « 0 ligne » sans rien dire
--    (ADR 0019). La lecture reste ouverte sans drapeau : la procédure de purge en a besoin.
DROP POLICY IF EXISTS "page_view_owner_select" ON "page_view";
--> statement-breakpoint
CREATE POLICY "page_view_owner_select" ON "page_view"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "page_view_owner_insert" ON "page_view";
--> statement-breakpoint
CREATE POLICY "page_view_owner_insert" ON "page_view"
	AS PERMISSIVE FOR INSERT TO "jadwal_owner" WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "page_view_owner_update" ON "page_view";
--> statement-breakpoint
CREATE POLICY "page_view_owner_update" ON "page_view"
	AS PERMISSIVE FOR UPDATE TO "jadwal_owner"
	USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
-- La suppression d'entretien, écrite ici plutôt que laissée à la boucle générique de la migration
-- 0019 : cette boucle ne dote que les tables **sans** politique `_owner_`, et `page_view` en reçoit
-- une juste au-dessus. À la première application elle passe donc son tour, mais au rejeu — où 0019
-- s'exécute avant ce fichier, quand la table existe déjà et n'a pas encore ses politiques — elle
-- créerait `page_view_owner_delete`. Les deux chemins ne donneraient pas le même schéma. On la
-- déclare, et ils coïncident.
DROP POLICY IF EXISTS "page_view_owner_delete" ON "page_view";
--> statement-breakpoint
CREATE POLICY "page_view_owner_delete" ON "page_view"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint

-- 5. Rétention du compteur : vingt-cinq mois, portée par une politique de suppression comme les
--    deux journaux. Vingt-cinq mois est le plafond que la CNIL retient pour une mesure d'audience
--    exemptée de consentement ; nous sommes en deçà de ce régime — rien n'est déposé sur le terminal
--    — mais s'aligner sur lui évite d'avoir à argumenter, et deux ans permettent de comparer une
--    rentrée à la précédente.
DROP POLICY IF EXISTS "page_view_owner_purge" ON "page_view";
--> statement-breakpoint
CREATE POLICY "page_view_owner_purge" ON "page_view"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING ("day" < (current_date - interval '25 months'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."purge_page_views"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."page_view";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_page_views"() FROM PUBLIC;
--> statement-breakpoint

-- 6. Le limiteur de débit, corrigé (ADR 0032).
--
--    Depuis l'étape 5, la clé du seau public est `public:<adresse IP>`, en clair et sans purge.
--    L'ADR 0009 et `docs/CONDITIONS.md` affirment pourtant qu'un visiteur ne laisse aucune donnée
--    personnelle : une adresse IP en est une, et une ligne qu'on n'efface jamais la conserve
--    indéfiniment. L'application ne pose plus désormais que des clés **hachées** ; il reste à
--    effacer ce que l'ancienne version a écrit, et à borner ce que la nouvelle écrira.
--
--    Les lignes existantes sont supprimées sans distinction : un seau de limitation de débit ne
--    vaut que quelques minutes, en perdre le contenu ne coûte rien, et trier les clés reviendrait à
--    relire les adresses qu'on veut justement faire disparaître.
--
--    L'effacement passe par une politique temporaire, et non par le seul droit du propriétaire : la
--    sécurité au niveau des lignes est **forcée** sur cette table, et les politiques de suppression
--    qu'elle porte sont bornées — l'une par le drapeau d'entretien, l'autre par l'âge de la ligne.
--    Un `DELETE` nu n'emporterait donc rien du tout, et ne dirait rien : c'est précisément le
--    « 0 ligne » muet contre lequel l'ADR 0019 met en garde. Écrit sans cette politique, ce fichier
--    a d'ailleurs laissé `public:127.0.0.1` en place lors de sa première application.
DROP POLICY IF EXISTS "rate_limit_owner_wipe" ON "rate_limit";
--> statement-breakpoint
CREATE POLICY "rate_limit_owner_wipe" ON "rate_limit"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner" USING (true);
--> statement-breakpoint
DELETE FROM "rate_limit";
--> statement-breakpoint
-- Et on le prouve dans la même transaction : si une ligne survit, la migration échoue au lieu de
-- laisser croire que les anciennes clés ont disparu.
DO $verifie$
BEGIN
	IF EXISTS (SELECT 1 FROM public."rate_limit") THEN
		RAISE EXCEPTION 'rate_limit non vidée : les anciennes clés en clair subsistent';
	END IF;
END
$verifie$;
--> statement-breakpoint
DROP POLICY "rate_limit_owner_wipe" ON "rate_limit";
--> statement-breakpoint
DROP POLICY IF EXISTS "rate_limit_owner_purge" ON "rate_limit";
--> statement-breakpoint
-- La fenêtre la plus longue du service est d'une heure (les liens magiques). Au-delà d'un jour, une
-- ligne ne sert plus à rien : la purge peut l'emporter, et elle ne peut emporter que celles-là.
CREATE POLICY "rate_limit_owner_purge" ON "rate_limit"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING ("last_request" < (extract(epoch from now() - interval '1 day') * 1000)::bigint);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."purge_rate_limit"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."rate_limit";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_rate_limit"() FROM PUBLIC;
--> statement-breakpoint
-- Le propriétaire doit pouvoir lire ce qu'il purge ici : la politique de suppression porte sur
-- `last_request`, et sans lecture la procédure ne verrait aucune ligne à supprimer.
DROP POLICY IF EXISTS "rate_limit_owner_select" ON "rate_limit";
--> statement-breakpoint
CREATE POLICY "rate_limit_owner_select" ON "rate_limit"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (true);
