-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Supprimer une salle qu'un cours occupe : le cours perd sa salle, et garde son organisation.
--
-- Un cours désigne sa salle par une clé étrangère composite, `(room_id, organization_id)`, parce
-- que les vérifications de clé contournent la sécurité au niveau des lignes : sans l'organisation
-- dans la clé, un cours pourrait désigner la salle d'une autre organisation (ADR 0013). Depuis la
-- migration 0001, cette clé portait `ON DELETE SET NULL`, qui vide toutes les colonnes de la clé :
-- supprimer une salle occupée essayait de vider aussi `organization_id`, qui ne peut pas être vide,
-- et la suppression échouait (23502). L'écran des réglages rendait alors une erreur 500.
--
-- PostgreSQL accepte depuis la version 15 une liste de colonnes pour cette action :
-- `ON DELETE SET NULL (room_id)` ne vide que la salle. La clé reste composite, et elle refuse
-- toujours la salle d'une autre organisation. Le dépôt tourne sur PostgreSQL 18.
--
-- Drizzle ne sait pas écrire cette liste : le schéma (`src/schema/index.ts`) garde
-- `onDelete('set null')`, et un commentaire y renvoie ici. Aucun instantané ne suit ce fichier : la
-- prochaine génération part de `meta/0060_snapshot.json`, où rien de ce que Drizzle connaît n'a
-- changé. `test/room-delete.test.ts` relit la définition réelle de la clé.

ALTER TABLE "course" DROP CONSTRAINT IF EXISTS "course_room_fk";
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_room_fk" FOREIGN KEY ("room_id","organization_id") REFERENCES "public"."room"("id","organization_id") ON DELETE SET NULL ("room_id") ON UPDATE NO ACTION;
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	cle record;
	salle smallint;
	organisation smallint;
BEGIN
	SELECT attnum INTO salle FROM pg_attribute
	WHERE attrelid = 'public.course'::regclass AND attname = 'room_id';
	SELECT attnum INTO organisation FROM pg_attribute
	WHERE attrelid = 'public.course'::regclass AND attname = 'organization_id';

	SELECT contype, confrelid, conkey, confdeltype, confdelsetcols, confupdtype, convalidated
	INTO cle
	FROM pg_constraint
	WHERE conrelid = 'public.course'::regclass AND conname = 'course_room_fk';

	IF NOT FOUND OR cle.contype <> 'f' OR cle.confrelid <> 'public.room'::regclass
		OR NOT cle.convalidated THEN
		RAISE EXCEPTION 'course_room_fk : manque, ou ne désigne pas une salle';
	END IF;
	-- Toujours composite : la salle et l'organisation.
	IF cle.conkey IS DISTINCT FROM ARRAY[salle, organisation] THEN
		RAISE EXCEPTION 'course_room_fk : doit porter sur (room_id, organization_id), porte sur %',
			cle.conkey;
	END IF;
	-- À la suppression de la salle, seule la salle se vide.
	IF cle.confdeltype <> 'n' OR cle.confdelsetcols IS DISTINCT FROM ARRAY[salle] THEN
		RAISE EXCEPTION 'course_room_fk : la suppression doit vider room_id seule (%, %)',
			cle.confdeltype, cle.confdelsetcols;
	END IF;
	IF cle.confupdtype <> 'a' THEN
		RAISE EXCEPTION 'course_room_fk : la modification doit rester sans action';
	END IF;
END
$verifie$;
