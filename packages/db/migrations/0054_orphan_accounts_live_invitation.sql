-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Seule une invitation qui court encore retient un compte sans organisation.
--
-- `docs/CONDITIONS.md` promet qu'un compte sans organisation et inactif part au bout de douze mois au
-- plus. `purge_orphan_accounts` (migration 0034) le gardait tant qu'une invitation en attente visait
-- son adresse, **même expirée**. Or une invitation expirée ne peut plus être acceptée, et elle n'est
-- effacée que quatre-vingt-dix jours après sa fin (migration 0049) : elle retenait le compte jusqu'à
-- quatorze jours de validité et quatre-vingt-dix jours de plus au-delà des douze mois.
--
-- Une invitation en cours de validité reste une raison de garder le compte : quelqu'un attend cette
-- personne, et c'est de l'activité. La condition exige désormais `expires_at > now()`, la même que
-- celle de l'écran des membres et de l'acceptation.
--
-- La condition vit dans la procédure seule. La politique de suppression d'entretien du propriétaire
-- sur `user` (`user_owner_delete`) n'exige que le drapeau `jadwal.maintenance` : elle ne dit rien
-- des invitations, et n'a donc rien à changer. Tout le reste de la définition est repris de 0034 à
-- l'identique : la signature, le drapeau posé pour la transaction seule, le chemin de recherche
-- figé, le droit d'exécution retiré à tous.
--
-- Au rejeu, la migration 0034 remet l'ancienne définition, et celle-ci la remplace juste après :
-- l'ordre des fichiers suffit, 0034 reste telle qu'elle a été appliquée.
CREATE OR REPLACE FUNCTION "jadwal"."purge_orphan_accounts"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimes bigint;
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	DELETE FROM public."user" u
	WHERE u."created_at" < now() - interval '12 months'
		AND u."is_super_admin" = false
		AND NOT EXISTS (SELECT 1 FROM public."membership" m WHERE m."user_id" = u."id")
		AND NOT EXISTS (SELECT 1 FROM public."session" s WHERE s."user_id" = u."id")
		AND NOT EXISTS (
			SELECT 1 FROM public."invitation" i
			WHERE i."status" = 'pending' AND i."expires_at" > now()
				AND lower(i."email") = lower(u."email")
		);
	GET DIAGNOSTICS supprimes = ROW_COUNT;
	RETURN supprimes;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_orphan_accounts"() FROM PUBLIC;
