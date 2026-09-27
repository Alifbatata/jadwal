-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le module des heures de prière, rallumé là où un cours s'appuie encore sur lui (étape 19, lot 2,
-- ADR 0042 et 0019).
--
-- La migration 0050 a posé `organization.prayer_module`, éteint par défaut, puis a voulu l'allumer
-- pour les organisations qui se servaient déjà des heures de prière. Sa mise à jour a tourné sous le
-- propriétaire, soumis à la sécurité au niveau des lignes (ADR 0019), **sans le drapeau
-- d'entretien** : hors de ce drapeau, le propriétaire ne voit aucune ligne, et un `update` rend
-- « 0 ligne » sans rien dire. Sur une base qui avait déjà des organisations, elle n'a rien fait, et
-- aucune preuve ne l'a vu. Une nuance : le bloc `$efface$` de la migration 0049 pose ce drapeau et
-- ne le coupe pas. Drizzle joue un lot de migrations dans une seule transaction : sur une base qui a
-- reçu 0049 et 0050 dans le même lot, la mise à jour a fait son travail ; sur une base déjà à 0049,
-- elle n'a rien fait. Le test `test/prayer-module-repair.test.ts` montre les deux.
--
-- Ce qui a pu rester, et que cette migration répare : une organisation au module éteint qui a encore
-- un cours ancré sur une prière ou une session du vendredi. Le déclencheur de 0050 interdit de créer
-- cet état autrement (on n'éteint pas le module sous un tel cours, on ne crée pas un tel cours sous
-- un module éteint), et la page publique ne sait pas l'afficher : le cours ancré n'a plus d'heure.
-- Elle retrouve son module allumé. Une organisation qui n'a que des réglages, des jours importés ou
-- des périodes d'horaires n'est pas touchée : elle a pu éteindre le module exprès depuis, et rien ne
-- dit le contraire.
--
-- Le drapeau est posé pour la seule mise à jour, puis coupé, comme dans la migration 0067 : les
-- migrations suivantes du lot n'ont pas à l'hériter. La date de modification suit, comme pour toute
-- écriture d'une organisation. Le rejeu ne trouve plus rien à rallumer, et ne change rien.
--
-- Les autres écritures de données des migrations 0000 à 0071 ont été relevées une à une ; aucune
-- autre n'a pu rester sans effet (`docs/adr/0019-proprietaire-non-privilegie.md`, addendum du
-- 27.09.2026).

SELECT set_config('jadwal.maintenance', 'on', true);
--> statement-breakpoint
UPDATE "organization" o SET "prayer_module" = true, "updated_at" = now()
WHERE NOT o."prayer_module" AND EXISTS (
	SELECT 1 FROM "course" c
	WHERE c."organization_id" = o."id" AND (c."kind" = 'jumua' OR c."timing_kind" = 'prayer')
);
--> statement-breakpoint
SELECT set_config('jadwal.maintenance', 'off', true);
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	restantes integer;
BEGIN
	-- Le drapeau est coupé après la mise à jour : la suite du lot ne l'hérite pas. C'est vérifié
	-- d'abord, avant que la preuve ne le pose à son tour pour lire.
	IF jadwal.maintenance() THEN
		RAISE EXCEPTION 'organization : le drapeau d''entretien est resté posé après la mise à jour';
	END IF;
	-- La preuve lit sous le drapeau, par les politiques d'entretien du propriétaire : sans elles, la
	-- lecture ne rendrait rien, et la preuve passerait à vide. Elles se vérifient d'abord.
	IF (
		SELECT count(*) FROM pg_policies
		WHERE schemaname = 'public' AND current_user = ANY (roles)
			AND ((tablename = 'organization' AND policyname IN ('organization_owner_select',
					'organization_owner_update'))
				OR (tablename = 'course' AND policyname = 'course_owner_select'))
			AND coalesce(qual, '') LIKE '%maintenance()%'
	) <> 3 THEN
		RAISE EXCEPTION 'organization, course : les politiques d''entretien du propriétaire manquent';
	END IF;
	PERFORM set_config('jadwal.maintenance', 'on', true);
	SELECT count(*) INTO restantes
	FROM public."organization" o
	WHERE NOT o."prayer_module" AND EXISTS (
		SELECT 1 FROM public."course" c
		WHERE c."organization_id" = o."id" AND (c."kind" = 'jumua' OR c."timing_kind" = 'prayer')
	);
	PERFORM set_config('jadwal.maintenance', 'off', true);
	IF restantes > 0 THEN
		RAISE EXCEPTION 'organization : % organisation(s) au module éteint gardent un cours qui en dépend',
			restantes;
	END IF;
END
$verifie$;
