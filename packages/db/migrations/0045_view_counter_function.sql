-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le compteur de vues n'est plus écrit par le rôle public lui-même (ADR 0032, révisé à l'étape 8).

-- Ce que l'étape 7 avait laissé ouvert, et que ce fichier ferme.
--
-- Pour incrémenter, le rôle public avait `SELECT`, `INSERT` et `UPDATE` sur `page_view` : un
-- `count = count + 1` lit avant d'écrire. La lecture était bornée par une politique — l'organisation
-- doit être visible du public — mais elle restait une lecture, et elle portait sur **toutes** les
-- organisations actives. Ce n'était pas une fuite de donnée personnelle, la table n'en contient
-- aucune, mais une organisation pouvait en théorie lire les chiffres d'une autre.
--
-- L'incrément passe désormais par une fonction du propriétaire. Le rôle public n'a plus **aucun**
-- droit sur la table : son `select` échoue sur un droit absent, avant qu'une ligne soit examinée,
-- exactement comme sur le journal d'audit.

-- 1. La fonction. Elle ne sait faire qu'une chose, et ses trois arguments ne laissent rien choisir
--    d'autre : ni la valeur ajoutée, qui vaut toujours un, ni la table, ni la colonne.
--
--    `SECURITY DEFINER` veut dire qu'elle s'exécute avec les droits du propriétaire. Trois
--    précautions vont avec, et aucune n'est décorative :
--      `search_path` figé, pour qu'un appelant ne puisse pas glisser sa propre table `page_view`
--      devant la nôtre dans un schéma temporaire ;
--      `pg_temp` en dernier, pour la même raison ;
--      `REVOKE ALL FROM PUBLIC` plus bas, parce qu'une fonction est exécutable par tout le monde
--      par défaut.
--
--    Le drapeau d'entretien est levé pour la durée de l'écriture, puis **remis dans l'état où il
--    était**. Le propriétaire est soumis à la sécurité au niveau des lignes comme les autres
--    (ADR 0019) et ses politiques d'écriture sur `page_view` exigent ce drapeau ; le lever ici, dans
--    le corps de la seule fonction qui en a besoin, est la portée la plus étroite possible. Il ne
--    peut pas être posé dans la clause `SET` de la fonction : PostgreSQL refuse d'y nommer un
--    paramètre personnalisé à un rôle non superutilisateur — mesuré, code 42501.
--
--    L'existence de l'organisation n'est pas vérifiée ici : la clé étrangère de `page_view` s'en
--    charge, et elle le fait mieux qu'une condition qu'on pourrait oublier.
CREATE OR REPLACE FUNCTION "jadwal"."count_view"(p_org uuid, p_day date, p_kind text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
	avant text := coalesce(current_setting('jadwal.maintenance', true), '');
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	INSERT INTO public."page_view" ("organization_id", "day", "kind", "count")
	VALUES (p_org, p_day, p_kind, 1)
	ON CONFLICT ("organization_id", "day", "kind")
		DO UPDATE SET "count" = "page_view"."count" + 1;
	PERFORM set_config('jadwal.maintenance', avant, true);
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."count_view"(uuid, date, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."count_view"(uuid, date, text) TO "jadwal_public";
--> statement-breakpoint
-- Et le droit d'entrer dans le schéma, sans lequel le reste ne sert à rien. Ce que cela ouvre est
-- borné et vérifié : toutes les fonctions de `jadwal` sont déjà retirées à PUBLIC, sauf
-- `has_no_duplicate`, qui compare les éléments d'un tableau et ne touche à aucune table — elle est
-- appelée par des contraintes de vérification, donc la retirer casserait les écritures de tous les
-- rôles. `catalog.test.ts` tient la liste de ce que le rôle public peut exécuter ici.
GRANT USAGE ON SCHEMA "jadwal" TO "jadwal_public";
--> statement-breakpoint

-- 2. Les droits du rôle public disparaissent. Les politiques qui les accompagnaient ont déjà été
--    retirées par la migration précédente ; sans les droits, elles n'auraient de toute façon plus
--    rien à borner.
REVOKE ALL ON "page_view" FROM "jadwal_public";
--> statement-breakpoint

-- 3. Et on le prouve, plutôt que de l'affirmer : si un droit subsistait, la migration échouerait
--    ici au lieu de laisser croire que la table est hors de portée.
DO $verifie$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.role_table_grants
		WHERE table_schema = 'public' AND table_name = 'page_view' AND grantee = 'jadwal_public'
	) THEN
		RAISE EXCEPTION 'le rôle public garde un droit sur page_view';
	END IF;
END
$verifie$;
