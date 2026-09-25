-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une invitation dure quatorze jours au plus, et la base le tient (ADR 0017).
--
-- L'écran des membres pose la fin à quatorze jours (`INVITATION_DAYS`), mais la base n'exigeait que
-- `expires_at > created_at` : un appel direct créait une invitation de quinze jours, ou d'un an, sans
-- un mot. Deux gestes, et le second compte autant que le premier :
--
-- 1. une contrainte de vérification borne la durée à quatorze jours. Elle compte une durée écoulée :
--    la différence de deux `timestamptz` ne dépend d'aucun fuseau, et sa comparaison à un intervalle
--    compte un jour pour vingt-quatre heures. Quatorze jours y valent donc 336 heures, sous tous les
--    fuseaux. Une date de calendrier (`created_at + interval '14 days'`) dépendrait du fuseau de la
--    session : par-dessus le passage à l'heure d'hiver, quatorze jours comptés à Zurich font 337
--    heures, et une vérification rejouée à la restauration d'une sauvegarde, sous un autre fuseau,
--    pourrait refuser des lignes que l'insertion avait acceptées. La fin que pose l'écran doit donc
--    compter en heures elle aussi : `make_interval(days => 14)` compte des jours de calendrier dans
--    le fuseau de la session, que tout rôle peut changer pour lui-même, et la contrainte refuserait
--    ses 337 heures. `test/invitation-expiry.test.ts` évalue la fin de l'écran sous deux fuseaux ;
-- 2. `created_at` appartient au serveur, par le procédé du journal (ADR 0020). Le rôle applicatif
--    et le super-admin pouvaient le nommer à l'insertion, et le super-admin le modifier : une
--    création datée de l'an prochain, une fin quatorze jours plus tard, et la borne ne bornait
--    rien. Le droit est désormais accordé colonne par colonne, toutes sauf `created_at`. Nommer la
--    colonne est refusé, quelle que soit la valeur, `default` compris. Les droits de modification
--    du rôle applicatif ne changent pas : la réponse seule, depuis la migration 0029.
--
-- Une colonne ajoutée plus tard à `invitation` ne sera ni insérable ni modifiable par ces deux
-- rôles tant qu'une migration ne la leur accorde pas : c'est la contrepartie des droits de colonne,
-- déjà vraie pour `membership` (0053) et `terms_acceptance` (0052).
--
-- Au rejeu, la boucle de la migration 0034 rend au super-admin les droits de table, et 0017 rend
-- l'insertion au rôle applicatif ; celle-ci les retire juste après. Retirer un droit de table
-- retire aussi les droits de colonne correspondants : l'accord qui suit repart de zéro, au premier
-- passage comme au rejeu.
--
-- La contrainte est aussi déclarée dans le schéma, et `meta/0056_snapshot.json` est l'instantané
-- que Drizzle Kit produit pour lui, avec les politiques de 0055 : une prochaine génération part de
-- là et ne réécrit ni l'une ni les autres.

-- 1. La preuve sur l'existant, avant de poser quoi que ce soit : une ligne hors de la borne, et la
--    migration refuse de s'appliquer en disant combien. Le propriétaire lit toutes les invitations
--    sans son drapeau d'entretien (`invitation_owner_read`, migration 0024), donc le compte ne peut
--    pas rendre zéro en silence. L'ajout de la contrainte vérifie de toute façon chaque ligne, hors
--    des politiques : ce bloc ne fait que donner un message clair.
DO $existant$
DECLARE
	hors_borne bigint;
BEGIN
	SELECT count(*) INTO hors_borne FROM public."invitation"
	WHERE "expires_at" - "created_at" > interval '14 days';
	IF hors_borne > 0 THEN
		RAISE EXCEPTION 'invitation : % invitation(s) durent plus de quatorze jours, la borne ne peut pas être posée',
			hors_borne;
	END IF;
END
$existant$;
--> statement-breakpoint

-- 2. La borne, telle que Drizzle Kit la produit pour le schéma. Retirée d'abord, pour le rejeu.
ALTER TABLE "invitation" DROP CONSTRAINT IF EXISTS "invitation_duration_ck";
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_duration_ck" CHECK (("invitation"."expires_at" - "invitation"."created_at" <= interval '14 days') is true);
--> statement-breakpoint

-- 3. `created_at` appartient au serveur.
REVOKE INSERT ON "invitation" FROM "jadwal_app";
--> statement-breakpoint
GRANT INSERT ("id", "organization_id", "email", "role", "status", "invited_by", "expires_at",
	"resolved_at", "accepted_by") ON "invitation" TO "jadwal_app";
--> statement-breakpoint
REVOKE INSERT, UPDATE ON "invitation" FROM "jadwal_superadmin";
--> statement-breakpoint
GRANT INSERT ("id", "organization_id", "email", "role", "status", "invited_by", "expires_at",
	"resolved_at", "accepted_by") ON "invitation" TO "jadwal_superadmin";
--> statement-breakpoint
GRANT UPDATE ("id", "organization_id", "email", "role", "status", "invited_by", "expires_at",
	"resolved_at", "accepted_by") ON "invitation" TO "jadwal_superadmin";
--> statement-breakpoint

-- 4. La preuve, dans la même transaction. Un droit oublié ou de trop ne lève rien au moment où on
--    l'accorde : il se découvre à l'usage. Si l'état n'est pas exactement celui que ce fichier
--    annonce, la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	t CONSTANT text := 'public.invitation';
	colonne text;
	role_name text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'invitation_duration_ck' AND conrelid = t::regclass
			AND contype = 'c' AND convalidated
	) THEN
		RAISE EXCEPTION 'invitation : la borne des quatorze jours manque';
	END IF;

	-- Plus aucun droit de table pour écrire : tout passe par les colonnes.
	IF has_table_privilege('jadwal_app', t, 'INSERT')
		OR has_table_privilege('jadwal_superadmin', t, 'INSERT')
		OR has_table_privilege('jadwal_superadmin', t, 'UPDATE') THEN
		RAISE EXCEPTION 'invitation : un droit de table laisse nommer created_at';
	END IF;

	-- Chaque colonne de la table, y compris une colonne ajoutée plus tard.
	FOR colonne IN
		SELECT attname FROM pg_attribute
		WHERE attrelid = t::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		FOREACH role_name IN ARRAY ARRAY['jadwal_app', 'jadwal_superadmin'] LOOP
			IF has_column_privilege(role_name, t, colonne, 'INSERT') <> (colonne <> 'created_at') THEN
				RAISE EXCEPTION 'invitation : droit d''insertion de % faux sur %', role_name, colonne;
			END IF;
		END LOOP;
		IF has_column_privilege('jadwal_superadmin', t, colonne, 'UPDATE')
			<> (colonne <> 'created_at') THEN
			RAISE EXCEPTION 'invitation : droit de modification de jadwal_superadmin faux sur %',
				colonne;
		END IF;
		-- Le rôle applicatif ne modifie que la réponse (migration 0029), et cela ne bouge pas.
		IF has_column_privilege('jadwal_app', t, colonne, 'UPDATE')
			<> (colonne IN ('status', 'accepted_by', 'resolved_at')) THEN
			RAISE EXCEPTION 'invitation : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;

	-- Le reste des droits ne bouge pas : lire et retirer, pour les deux.
	FOREACH role_name IN ARRAY ARRAY['jadwal_app', 'jadwal_superadmin'] LOOP
		IF NOT (has_table_privilege(role_name, t, 'SELECT')
			AND has_table_privilege(role_name, t, 'DELETE')) THEN
			RAISE EXCEPTION 'invitation : % a perdu la lecture ou le retrait', role_name;
		END IF;
	END LOOP;
END
$verifie$;
