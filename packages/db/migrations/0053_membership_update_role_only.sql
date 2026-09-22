-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le rôle applicatif ne modifie d'une adhésion que le rôle et sa date.
--
-- L'étape 3 lui avait rendu la modification des adhésions sur toute la ligne (migration 0012), et la
-- politique `membership_update` ne vérifie que l'organisation du contexte. N'importe quel membre,
-- éditrice comprise (la base ne distingue pas les rôles), pouvait donc repointer une adhésion de son
-- organisation vers un compte existant jamais invité : la vérification de la clé étrangère contourne
-- la sécurité au niveau des lignes, puis `user_select` ouvrait le courriel de ce compte aux membres
-- de l'organisation. C'est l'évasion que l'ADR 0013 dit fermée : la migration 0024 avait fermé
-- l'insertion, pas la modification.
--
-- Le même droit servait d'oracle sur les acceptations des conditions (migration 0051). Repointer
-- l'adhésion d'une collègue butait sur la clé `terms_acceptance_membership_fk` si elle avait accepté,
-- sur `membership_user_fk` sinon, et le message nommait la contrainte.
--
-- Le code de l'application n'a jamais pris ce chemin : l'écran des membres n'écrit que `role` et
-- `updated_at`, par l'identifiant. Le droit est ramené à ces deux colonnes. Le refus tombe alors sur
-- un droit absent, avant qu'une ligne soit examinée et avant toute clé : il ne dit rien de ce qui
-- existe.
--
-- Le super-admin garde la modification de toute la ligne, par décision (ADR 0025) : il crée déjà une
-- adhésion pour qui il veut dans l'organisation où il est entré, et il lit tous les comptes.
-- Déplacer une adhésion ne lui ouvre rien de plus.
--
-- Au rejeu, la migration 0012 rend le droit large, et celle-ci le retire juste après : l'ordre des
-- fichiers suffit, 0012 reste telle qu'elle a été appliquée.

-- Retirer le droit de table retire aussi les droits de colonne correspondants : l'accord qui suit
-- repart de zéro, au premier passage comme au rejeu.
REVOKE UPDATE ON "membership" FROM "jadwal_app";
--> statement-breakpoint
GRANT UPDATE ("role", "updated_at") ON "membership" TO "jadwal_app";
--> statement-breakpoint

-- La preuve, dans la même transaction. Un droit de trop ne lève rien au moment où on l'accorde : il
-- se découvre à l'usage. Si l'état n'est pas exactement celui que ce fichier annonce, la migration
-- échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	t CONSTANT text := 'public.membership';
	colonne text;
	role_name text;
BEGIN
	IF has_table_privilege('jadwal_app', t, 'UPDATE') THEN
		RAISE EXCEPTION 'membership : jadwal_app modifie encore toute la ligne';
	END IF;

	-- Chaque colonne de la table, y compris une colonne ajoutée plus tard : seules les deux accordées
	-- se modifient.
	FOR colonne IN
		SELECT attname FROM pg_attribute
		WHERE attrelid = t::regclass AND attnum > 0 AND NOT attisdropped
	LOOP
		IF has_column_privilege('jadwal_app', t, colonne, 'UPDATE')
			<> (colonne IN ('role', 'updated_at')) THEN
			RAISE EXCEPTION 'membership : droit de modification de jadwal_app faux sur %', colonne;
		END IF;
	END LOOP;

	-- Le reste des droits du rôle applicatif ne bouge pas : lire, rejoindre sur invitation, retirer.
	IF NOT (has_table_privilege('jadwal_app', t, 'SELECT')
		AND has_table_privilege('jadwal_app', t, 'INSERT')
		AND has_table_privilege('jadwal_app', t, 'DELETE')) THEN
		RAISE EXCEPTION 'membership : jadwal_app a perdu la lecture, l''entrée ou le retrait';
	END IF;

	-- Et aucun autre rôle de connexion ne modifie une adhésion.
	FOREACH role_name IN ARRAY ARRAY['jadwal_auth', 'jadwal_public', 'public'] LOOP
		IF has_any_column_privilege(role_name, t, 'UPDATE') THEN
			RAISE EXCEPTION 'membership : % peut modifier une adhésion', role_name;
		END IF;
	END LOOP;
END
$verifie$;
