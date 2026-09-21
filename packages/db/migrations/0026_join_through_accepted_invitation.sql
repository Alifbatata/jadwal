-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- L'adhésion suit l'acceptation, et l'acceptation seule l'autorise (ADR 0017).
--
-- L'ordre compte. La personne accepte d'abord : la politique de mise à jour d'`invitation` la
-- reconnaît par son adresse, que le lien magique vient de prouver. Elle écrit alors son identifiant
-- dans `accepted_by`. Ce n'est qu'ensuite qu'elle peut créer son adhésion, et la politique le
-- vérifie en lisant cette seule colonne.
--
-- Pourquoi une fonction à droits du définisseur : vue par le rôle applicatif, la lecture
-- d'`invitation` consulte `user`, dont la politique consulte `membership`. Une politique de
-- `membership` qui lirait `invitation` par ce chemin boucle. Sous le propriétaire, avec une
-- politique de lecture qui ne consulte rien d'autre, la chaîne s'arrête.

CREATE OR REPLACE FUNCTION "jadwal"."invited"(organisation uuid, personne uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
	SELECT EXISTS (
		SELECT 1 FROM public."invitation" i
		WHERE i."organization_id" = organisation
			AND i."accepted_by" = personne
			AND i."status" = 'accepted'
	)
$fn$;
