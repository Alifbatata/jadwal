// Schéma de la base de jadwal. Noms de tables et de colonnes en anglais ; les colonnes de rythme et
// d'horaire reprennent exactement le modèle de @jadwal/core (colonnes explicites, jamais de RRULE :
// ADR 0003). Les énumérations sont des contraintes de vérification et non des types énumérés, pour
// qu'ajouter une valeur reste une simple migration.
//
// Isolation : ADR 0013. Chaque table qui porte des données d'organisation a une colonne
// `organization_id`, une politique par opération accordée, et la RLS forcée par la migration de
// durcissement (Drizzle ne sait pas émettre `FORCE ROW LEVEL SECURITY`).

import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	date,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgPolicy,
	pgRole,
	pgTable,
	primaryKey,
	smallint,
	text,
	time,
	timestamp,
	unique,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

/** Rôles créés par la migration d'amorçage : Drizzle ne sait ni les créer ni leur poser un mot de passe. */
export const appRole = pgRole('jadwal_app').existing();
export const superAdminRole = pgRole('jadwal_superadmin').existing();
/** Rôle de la connexion : lui seul touche aux tables de session (ADR 0016). */
export const authRole = pgRole('jadwal_auth').existing();
/**
 * Rôle du côté public (ADR 0026). Il ne pose aucun contexte d'organisation — une page publique est
 * désignée par son identifiant d'URL — et ne voit que les organisations **actives** et les cours
 * **publiés**. « Un brouillon est invisible » est donc une propriété de la base, pas une clause
 * qu'un `select` pourrait oublier.
 */
export const publicRole = pgRole('jadwal_public').existing();

/**
 * Organisation et utilisateur du contexte de la transaction. Entre parenthèses, l'appel est évalué
 * une fois par requête et non une fois par ligne (ADR 0013).
 */
const orgContext = sql`(select jadwal.current_org_id())`;
const userContext = sql`(select jadwal.current_user_id())`;

/** L'identifiant doit être un UUID v7 canonique : la règle de l'étape 1 tenue par la base (ADR 0014). */
const isUuidV7 = (column: SQLWrapper) =>
	sql`${column}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`;

/**
 * Contrainte de vérification stricte. PostgreSQL n'écarte une ligne que si la contrainte rend
 * FALSE : une contrainte qui rend NULL accepte. Or presque tout rend NULL au contact d'un NULL,
 * `array_length` d'un tableau vide comme une comparaison avec une valeur absente. `is true` ramène
 * NULL à FALSE : ce qui n'est pas explicitement autorisé est refusé. Toutes les contraintes du
 * schéma passent par ici, et `test/catalog.test.ts` échoue si l'une d'elles l'oublie.
 */
function ck(name: string, expression: SQL) {
	return check(name, sql`(${expression}) is true`);
}

/**
 * Une heure civile telle que `@jadwal/core` sait la porter : `HH:MM`, sans seconde ni fraction, et
 * strictement avant minuit. Le type `time` de PostgreSQL accepte `24:00:00` et les microsecondes.
 */
const isLocalTime = (column: SQLWrapper) =>
	sql`${column} < time '24:00:00' and extract(second from ${column}) = 0`;

/** Liste non vide et sans valeur absente. `array_length` d'un tableau vide rend NULL, pas 0. */
const isNonEmptyList = (column: SQLWrapper) =>
	sql`cardinality(${column}) >= 1 and array_position(${column}, null) is null`;

const createdAt = () =>
	timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
	timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const PLANS = ['free', 'sponsored', 'paid'] as const;
export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const;
export const MEMBERSHIP_ROLES = ['org_admin', 'editor'] as const;
export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export const AUDIENCES = ['kids', 'youth', 'women', 'adults', 'open'] as const;
export const RECURRENCE_KINDS = ['weekly', 'monthly', 'dates'] as const;
export const TIMING_KINDS = ['fixed', 'prayer'] as const;
export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export const PRAYER_SOURCES = ['import', 'computed'] as const;
/**
 * Ce qu'un `course` peut être. Une session du vendredi passe par le **même** moteur qu'un cours —
 * même récurrence, mêmes exceptions, mêmes pauses, mêmes traductions, mêmes flux (ADR 0033). Seul
 * ce type, l'ordre d'affichage et trois contraintes les distinguent.
 */
export const COURSE_KINDS = ['course', 'jumua'] as const;
/** Les treize méthodes d'`adhan`, telles qu'elle les nomme (ADR 0004). */
export const CALCULATION_METHODS = [
	'MuslimWorldLeague',
	'Egyptian',
	'Karachi',
	'UmmAlQura',
	'Dubai',
	'MoonsightingCommittee',
	'NorthAmerica',
	'Kuwait',
	'Qatar',
	'Singapore',
	'Tehran',
	'Turkey',
	'Other'
] as const;
export const MADHABS = ['shafi', 'hanafi'] as const;
export const HIGH_LATITUDE_RULES = [
	'middleofthenight',
	'seventhofthenight',
	'twilightangle'
] as const;
/** Ce qu'un compteur de vues distingue, et la seule chose qu'il distingue (ADR 0032). */
export const VIEW_KINDS = ['page', 'embed', 'feed'] as const;
export const EXCEPTION_KINDS = ['cancelled', 'moved'] as const;
/** Ce que le registre interne du super-admin sait distinguer (ADR 0025). */
export const ADMIN_ACCESS_ACTIONS = ['read', 'write', 'magic_link'] as const;

/**
 * `colonne in ('x', 'y')`, pour une contrainte de vérification d'énumération. Les valeurs sont
 * écrites en littéral : dans une contrainte, un paramètre lié resterait un `$1` que personne ne
 * remplace. Elles viennent des constantes ci-dessus, jamais d'une saisie, et le guillemet simple
 * est tout de même doublé.
 */
function oneOf(column: SQLWrapper, values: readonly string[]) {
	const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
	return sql`${column} in (${sql.raw(literals)})`;
}

/**
 * Une colonne qui désigne une personne ne peut désigner qu'une personne déjà visible. La
 * sous-requête passe par la politique de lecture de `user` : elle ne voit donc que ce que
 * l'organisation courante voit déjà.
 *
 * Sans cette garde, une écriture servait d'évasion : la vérification d'une clé étrangère contourne
 * toujours la sécurité au niveau des lignes, donc une organisation pouvait écrire une ligne
 * désignant la personne d'une autre. Sur `membership`, cela suffisait à s'ouvrir la lecture de
 * cette personne, puisque `user_select` accorde la lecture aux membres de l'organisation courante :
 * l'organisation fabriquait elle-même l'adhésion qui la faisait entrer. Sur les autres tables, cela
 * renseignait au moins sur l'existence d'un identifiant, la contrainte passant ou échouant.
 */
const referencesVisibleUser = (column: SQLWrapper) =>
	sql`(${column} is null or exists (select 1 from "user" u where u."id" = ${column}))`;

/**
 * L'organisation de cette ligne est-elle ouverte au public ? La sous-requête passe par la politique
 * de lecture d'`organization` pour le rôle public, qui exige déjà `status = 'active'` : suspendre
 * une organisation la retire du public partout à la fois, sans toucher à une seule autre politique.
 */
const inPublicOrganization = (column: SQLWrapper) =>
	sql`exists (select 1 from "organization" o where o."id" = ${column})`;

/** Lecture publique d'une table d'organisation : rien d'autre que `select`, et jamais un contexte. */
function publicSelect(name: string, column: SQLWrapper, extra?: SQL) {
	const scope = extra
		? sql`${inPublicOrganization(column)} and ${extra}`
		: inPublicOrganization(column);
	return pgPolicy(`${name}_public_select`, {
		as: 'permissive',
		for: 'select',
		to: publicRole,
		using: scope
	});
}

/**
 * Les quatre opérations, pour une table dont l'organisation est portée par `organization_id`.
 * `userColumns` nomme les colonnes qui désignent une personne : elles sont gardées à l'écriture.
 */
function orgPolicies(name: string, column: SQLWrapper, userColumns: SQLWrapper[] = []) {
	const scope = sql`${column} = ${orgContext}`;
	const written = userColumns.reduce(
		(guard, userColumn) => sql`${guard} and ${referencesVisibleUser(userColumn)}`,
		scope
	);
	return [
		pgPolicy(`${name}_select`, { as: 'permissive', for: 'select', to: appRole, using: scope }),
		pgPolicy(`${name}_insert`, {
			as: 'permissive',
			for: 'insert',
			to: appRole,
			withCheck: written
		}),
		pgPolicy(`${name}_update`, {
			as: 'permissive',
			for: 'update',
			to: appRole,
			using: scope,
			withCheck: written
		}),
		pgPolicy(`${name}_delete`, { as: 'permissive', for: 'delete', to: appRole, using: scope }),
		// Le super-admin fait tout, dans l'organisation où il est entré et nulle part ailleurs
		// (ADR 0025). Le contexte reste obligatoire, non pour le retenir — il choisit l'organisation
		// qu'il veut — mais pour qu'il ne modifie pas la mauvaise par inadvertance.
		...superAdminPolicies(name, scope, written)
	];
}

/** Les quatre mêmes opérations pour le super-admin, sans condition d'appartenance. */
function superAdminPolicies(name: string, scope: SQL, written: SQL) {
	return [
		pgPolicy(`${name}_superadmin_select`, {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: scope
		}),
		pgPolicy(`${name}_superadmin_insert`, {
			as: 'permissive',
			for: 'insert',
			to: superAdminRole,
			withCheck: written
		}),
		pgPolicy(`${name}_superadmin_update`, {
			as: 'permissive',
			for: 'update',
			to: superAdminRole,
			using: scope,
			withCheck: written
		}),
		pgPolicy(`${name}_superadmin_delete`, {
			as: 'permissive',
			for: 'delete',
			to: superAdminRole,
			using: scope
		})
	];
}

// ---------------------------------------------------------------------------------------------
// Organisations et personnes
// ---------------------------------------------------------------------------------------------

export const organization = pgTable(
	'organization',
	{
		id: uuid().primaryKey(),
		/** Repris dans l'URL publique : minuscules, chiffres et tirets. */
		slug: text().notNull(),
		name: text().notNull(),
		/** Nom IANA canonique, jamais un alias (étape 1, `canonicalTimeZone`). */
		timeZone: text('time_zone').notNull(),
		/** Couleur d'accent du widget, en notation hexadécimale. */
		accentColor: text('accent_color').notNull().default('#0f766e'),
		defaultLanguage: text('default_language').notNull(),
		enabledLanguages: text('enabled_language').array().notNull(),
		plan: text().notNull().default('free'),
		status: text().notNull().default('active'),
		/**
		 * Le module des heures de prière, éteint par défaut (ADR 0042). Il vit ici, et non sur
		 * `prayer_settings`, parce que la politique publique donne déjà cette ligne à tout le
		 * monde : la page publique, le widget et l'API le lisent sans jointure ni politique de
		 * plus. Un déclencheur refuse de l'éteindre tant qu'un cours est ancré sur une prière ou
		 * qu'une session du vendredi existe (migration 0050).
		 */
		prayerModule: boolean('prayer_module').notNull().default(false),
		/**
		 * La formule qui ouvre les messages prêts à coller. Les organisations ne se saluent pas toutes
		 * de la même façon, et personne n'a envie de corriger la même ligne chaque semaine.
		 */
		greeting: text().notNull().default('Salam alaykoum'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		uniqueIndex('organization_slug_uq').on(table.slug),
		ck('organization_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('organization_slug_ck', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
		ck('organization_accent_color_ck', sql`${table.accentColor} ~ '^#[0-9a-fA-F]{6}$'`),
		ck('organization_plan_ck', oneOf(table.plan, PLANS)),
		ck('organization_status_ck', oneOf(table.status, ORGANIZATION_STATUSES)),
		ck('organization_language_ck', isNonEmptyList(table.enabledLanguages)),
		ck('organization_greeting_ck', sql`length(btrim(${table.greeting})) > 0`),
		ck(
			'organization_default_language_ck',
			sql`${table.defaultLanguage} = any(${table.enabledLanguages})`
		),
		pgPolicy('organization_select', {
			as: 'permissive',
			for: 'select',
			to: appRole,
			// Son organisation… et celle qui vous invite : sans cela, une invitation ne pourrait pas
			// même dire de quelle organisation elle vient, et personne n'accepterait à l'aveugle
			// (ADR 0017). Une politique porte sur des lignes, pas sur des colonnes : la personne
			// invitée lit donc la ligne entière — nom, slug, fuseau, couleur, langues, plan, état,
			// dates — et rien d'autre ne s'ouvre, puisque membres, cours et journal exigent
			// l'appartenance.
			using: sql`${table.id} = ${orgContext}
				or exists (
					select 1 from "invitation" i
					join "user" u on lower(u."email") = lower(i."email")
					where i."organization_id" = ${table.id}
						and i."status" = 'pending' and i."expires_at" > now()
						and u."id" = ${userContext}
				)`
		}),
		pgPolicy('organization_update', {
			as: 'permissive',
			for: 'update',
			to: appRole,
			using: sql`${table.id} = ${orgContext}`,
			withCheck: sql`${table.id} = ${orgContext}`
		}),
		// Créer et supprimer une organisation relève du super-admin (ADR 0006).
		pgPolicy('organization_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`true`
		}),
		pgPolicy('organization_superadmin_insert', {
			as: 'permissive',
			for: 'insert',
			to: superAdminRole,
			withCheck: sql`true`
		}),
		pgPolicy('organization_superadmin_update', {
			as: 'permissive',
			for: 'update',
			to: superAdminRole,
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('organization_superadmin_delete', {
			as: 'permissive',
			for: 'delete',
			to: superAdminRole,
			using: sql`true`
		}),
		// Le côté public lit les organisations **actives**, sans contexte : une page publique est
		// désignée par son identifiant d'URL (ADR 0026). Suspendre une organisation la retire du
		// public partout à la fois, puisque toutes les autres politiques publiques passent par
		// celle-ci pour savoir si l'organisation est ouverte.
		pgPolicy('organization_public_select', {
			as: 'permissive',
			for: 'select',
			to: publicRole,
			using: sql`${table.status} = 'active'`
		})
	]
);

export const user = pgTable(
	'user',
	{
		id: uuid().primaryKey(),
		/** Insensible à la casse : l'unicité porte sur la forme en minuscules. */
		email: text().notNull(),
		name: text(),
		/** Posée par Better Auth quand la personne a suivi un lien magique (ADR 0016). */
		emailVerified: boolean('email_verified').notNull().default(false),
		/** Exigée par Better Auth ; le produit n'affiche aucune photo et ne la remplit jamais. */
		image: text(),
		isSuperAdmin: boolean('is_super_admin').notNull().default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		uniqueIndex('user_email_uq').on(sql`lower(${table.email})`),
		ck('user_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('user_email_ck', sql`${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`),
		// Pas d'annuaire global : un utilisateur est visible de lui-même et des membres de son
		// organisation courante. La sous-requête passe elle-même par la politique de `membership`.
		pgPolicy('user_select', {
			as: 'permissive',
			for: 'select',
			to: appRole,
			using: sql`${table.id} = ${userContext} or exists (
				select 1 from "membership" m
				where m."user_id" = ${table.id} and m."organization_id" = ${orgContext}
			)`
		}),
		// Better Auth crée et met à jour les comptes : c'est sa seule écriture dans une table du
		// métier (ADR 0016). Il ne supprime jamais un compte. La politique dit quelles lignes ; les
		// colonnes sont bornées par les droits accordés — jamais `is_super_admin`, que l'application
		// relit à chaque requête (migration 0029).
		pgPolicy('user_auth_select', {
			as: 'permissive',
			for: 'select',
			to: authRole,
			using: sql`true`
		}),
		// Il crée des comptes, jamais un compte super-admin. Un droit dit quelles colonnes on peut
		// nommer — et Drizzle les nomme toutes —, seule une politique dit quelle valeur on y met
		// (migration 0032).
		pgPolicy('user_auth_insert', {
			as: 'permissive',
			for: 'insert',
			to: authRole,
			withCheck: sql`${table.isSuperAdmin} = false`
		}),
		pgPolicy('user_auth_update', {
			as: 'permissive',
			for: 'update',
			to: authRole,
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy('user_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`true`
		})
	]
);

export const membership = pgTable(
	'membership',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		userId: uuid('user_id').notNull(),
		role: text().notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'membership_organization_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'membership_user_fk'
		}).onDelete('cascade'),
		unique('membership_organization_user_uq').on(table.organizationId, table.userId),
		index('membership_user_idx').on(table.userId),
		ck('membership_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('membership_role_ck', oneOf(table.role, MEMBERSHIP_ROLES)),
		// Attacher une personne à une organisation n'est pas une écriture ordinaire : c'est le flux
		// d'invitation, qui crée aussi le compte, et le rôle applicatif ne peut pas écrire dans
		// `user`. `membership_insert` et `membership_update` nomment donc le super-admin, pas le
		// rôle applicatif (ADR 0006 et 0013) ; les droits suivent dans la migration 0005.
		//
		// La garde employée ailleurs — « la personne désignée doit être déjà visible » — est ici
		// impossible : `user_select` lit `membership`, donc une politique de `membership` qui lit
		// `user` forme une récursion, et PostgreSQL la refuse (« infinite recursion detected in
		// policy for relation "membership" »), y compris à travers une fonction à droits du
		// définisseur. Sans ce retrait, une organisation fabriquait l'adhésion qui lui ouvrait la
		// lecture d'une personne d'une autre organisation : la vérification de clé étrangère
		// contourne toujours la sécurité au niveau des lignes.
		pgPolicy('membership_select', {
			as: 'permissive',
			for: 'select',
			to: appRole,
			// Les adhésions de l'organisation courante, et les siennes propres. La seconde branche
			// existe pour la toute première requête d'une session, quand on cherche justement de
			// quelles organisations quelqu'un est membre : il n'y a pas encore d'organisation à
			// poser. Elle ne révèle rien de personne d'autre.
			using: sql`${table.organizationId} = ${orgContext}
				or ${table.userId} = ${userContext}`
		}),
		// L'étape 2 avait retiré ces deux opérations au rôle applicatif pour fermer une évasion :
		// une organisation fabriquait l'adhésion qui lui ouvrait la lecture d'une personne d'une
		// autre organisation. L'étape 3 les lui rend sous une forme qui garde l'évasion fermée.
		//
		// On ne s'attache que soi-même : c'est l'invité qui crée son adhésion en acceptant, et
		// jamais l'organisation qui l'attache (ADR 0017). La politique ne lit que le contexte,
		// jamais la table des comptes, donc aucune récursion avec `user_select`.
		pgPolicy('membership_insert', {
			as: 'permissive',
			for: 'insert',
			to: appRole,
			withCheck: sql`${table.organizationId} = ${orgContext}
				and ${table.userId} = ${userContext}`
		}),
		// Changer le rôle d'un membre ne vise qu'une personne déjà membre, donc déjà visible : rien
		// ne fuit. Le dernier `org_admin` est protégé par un déclencheur, quel que soit l'appelant.
		pgPolicy('membership_update', {
			as: 'permissive',
			for: 'update',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}`,
			withCheck: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('membership_delete', {
			as: 'permissive',
			for: 'delete',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		// Le super-admin n'a pas de politique de lecture ici : « qui est responsable de quelle
		// organisation » est ce que le modèle de menace classe comme sensible, et cela relève de la
		// même fenêtre d'accès de support que le reste (ADR 0018). Il lit les organisations et les
		// comptes, pas le lien entre les deux.
		// Le super-admin invite, retire et change les rôles dans l'organisation où il est entré
		// (ADR 0025). Il n'en est membre d'aucune : c'est le contexte, et lui seul, qui le borne.
		pgPolicy('membership_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('membership_superadmin_insert', {
			as: 'permissive',
			for: 'insert',
			to: superAdminRole,
			withCheck: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('membership_superadmin_update', {
			as: 'permissive',
			for: 'update',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`,
			withCheck: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('membership_superadmin_delete', {
			as: 'permissive',
			for: 'delete',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`
		})
	]
);

export const room = pgTable(
	'room',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		name: text().notNull(),
		displayOrder: integer('display_order').notNull().default(0),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'room_organization_fk'
		}).onDelete('cascade'),
		// Cible d'une clé étrangère composite : une contrainte, pas un index unique.
		unique('room_id_organization_uq').on(table.id, table.organizationId),
		unique('room_organization_name_uq').on(table.organizationId, table.name),
		index('room_organization_idx').on(table.organizationId),
		ck('room_id_uuid_v7_ck', isUuidV7(table.id)),
		...orgPolicies('room', table.organizationId),
		publicSelect('room', table.organizationId)
	]
);

// ---------------------------------------------------------------------------------------------
// Cours : rythme et horaire, colonne par colonne comme @jadwal/core
// ---------------------------------------------------------------------------------------------

export const course = pgTable(
	'course',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		/**
		 * `course` ou `jumua`. Une session du vendredi est un cours d'un autre type, pas un second
		 * modèle : elle hérite de la récurrence, des exceptions, des pauses, des traductions et des
		 * flux sans qu'une ligne soit réécrite (ADR 0033).
		 */
		kind: text().notNull().default('course'),
		/**
		 * `jumua` : le rang de la session — première, deuxième, troisième —, qui décide de l'ordre
		 * d'affichage. Nul pour un cours.
		 */
		jumuaOrder: smallint('jumua_order'),
		status: text().notNull().default('draft'),
		audience: text().notNull(),
		/**
		 * Langues d'enseignement, codes ISO 639-1. Pour une session du vendredi, ce sont les langues
		 * **du sermon**, et c'est le mot qui doit apparaître à l'écran.
		 */
		teachingLanguages: text('teaching_language').array().notNull(),
		roomId: uuid('room_id'),
		/** Intervenant, texte libre facultatif. */
		teacher: text(),
		/** Langue de la traduction obligatoire (ADR 0007). */
		sourceLanguage: text('source_language').notNull(),

		recurrenceKind: text('recurrence_kind').notNull(),
		/** `weekly` : jours ISO 1 = lundi … 7 = dimanche, non vide et sans doublon. */
		recurrenceWeekdays: smallint('recurrence_weekday').array(),
		recurrenceInterval: smallint('recurrence_interval'),
		recurrenceAnchorDate: date('recurrence_anchor_date'),
		/** `monthly` : nième jour de semaine du mois, -1 pour le dernier. */
		recurrenceWeekday: smallint('recurrence_ordinal_weekday'),
		recurrenceOrdinal: smallint('recurrence_ordinal'),
		/** `dates` : les dates listées. */
		recurrenceDates: date('recurrence_date').array(),

		timingKind: text('timing_kind').notNull(),
		/** `fixed` : heures civiles, sans fuseau. */
		timingStart: time('timing_start'),
		timingEnd: time('timing_end'),
		/** `prayer` : ancrage, décalage de -120 à 240, durée de 5 à 1440. */
		timingPrayer: text('timing_prayer'),
		timingOffsetMinutes: smallint('timing_offset_minutes'),
		timingDurationMinutes: smallint('timing_duration_minutes'),

		startsOn: date('starts_on').notNull(),
		endsOn: date('ends_on'),
		/** Numéro de révision repris dans `SEQUENCE` à l'export ICS. */
		sequence: integer().notNull().default(0),

		createdAt: createdAt(),
		updatedAt: updatedAt(),
		updatedBy: uuid('updated_by')
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'course_organization_fk'
		}).onDelete('cascade'),
		// Clé étrangère composite : une salle d'une autre organisation est impossible (ADR 0013).
		foreignKey({
			columns: [table.roomId, table.organizationId],
			foreignColumns: [room.id, room.organizationId],
			name: 'course_room_fk'
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [user.id],
			name: 'course_updated_by_fk'
		}).onDelete('set null'),
		unique('course_id_organization_uq').on(table.id, table.organizationId),
		index('course_organization_idx').on(table.organizationId),
		index('course_organization_status_idx').on(table.organizationId, table.status),
		index('course_room_idx').on(table.roomId, table.organizationId),
		index('course_updated_by_idx').on(table.updatedBy),
		ck('course_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('course_kind_ck', oneOf(table.kind, COURSE_KINDS)),
		// Une session du vendredi porte un rang de 1 à 3 ; un cours n'en porte aucun.
		ck(
			'course_jumua_order_ck',
			sql`(${table.kind} = 'jumua') = (${table.jumuaOrder} is not null)
				and (${table.jumuaOrder} is null or ${table.jumuaOrder} between 1 and 3)`
		),
		// Trois contraintes qui font d'une session du vendredi ce qu'elle est, et que rien ne peut
		// contourner : elle a une **heure fixe**, elle revient **chaque semaine**, et c'est le
		// **vendredi**. L'ancrer sur une prière n'aurait aucun sens — c'est elle qui remplace le
		// Dhuhr de ce jour-là.
		ck(
			'course_jumua_shape_ck',
			sql`${table.kind} <> 'jumua' or (
				${table.timingKind} = 'fixed'
				and ${table.recurrenceKind} = 'weekly'
				and ${table.recurrenceInterval} = 1
				and ${table.recurrenceWeekdays} = array[5]::smallint[]
			)`
		),
		ck('course_status_ck', oneOf(table.status, COURSE_STATUSES)),
		ck('course_audience_ck', oneOf(table.audience, AUDIENCES)),
		ck('course_teaching_language_ck', isNonEmptyList(table.teachingLanguages)),
		ck('course_ends_on_ck', sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`),
		ck('course_sequence_ck', sql`${table.sequence} >= 0`),
		ck('course_recurrence_kind_ck', oneOf(table.recurrenceKind, RECURRENCE_KINDS)),
		ck('course_timing_kind_ck', oneOf(table.timingKind, TIMING_KINDS)),
		// Chaque forme de rythme porte ses colonnes, et seulement les siennes.
		ck(
			'course_recurrence_shape_ck',
			sql`case ${table.recurrenceKind}
				when 'weekly' then
					${table.recurrenceWeekdays} is not null
					and cardinality(${table.recurrenceWeekdays}) between 1 and 7
					and ${table.recurrenceWeekdays} <@ array[1,2,3,4,5,6,7]::smallint[]
					and jadwal.has_no_duplicate(${table.recurrenceWeekdays})
					and ${table.recurrenceInterval} in (1, 2)
					and ${table.recurrenceAnchorDate} is not null
					and ${table.recurrenceWeekday} is null and ${table.recurrenceOrdinal} is null
					and ${table.recurrenceDates} is null
				when 'monthly' then
					${table.recurrenceWeekday} between 1 and 7
					and ${table.recurrenceOrdinal} in (1, 2, 3, 4, -1)
					and ${table.recurrenceWeekdays} is null and ${table.recurrenceInterval} is null
					and ${table.recurrenceAnchorDate} is null and ${table.recurrenceDates} is null
				when 'dates' then
					${table.recurrenceDates} is not null
					and cardinality(${table.recurrenceDates}) >= 1
					and jadwal.has_no_duplicate(${table.recurrenceDates})
					and ${table.recurrenceWeekdays} is null and ${table.recurrenceInterval} is null
					and ${table.recurrenceAnchorDate} is null and ${table.recurrenceWeekday} is null
					and ${table.recurrenceOrdinal} is null
				else false end`
		),
		// Chaque forme d'horaire de même, avec les bornes du prompt de l'étape 1.
		ck(
			'course_timing_shape_ck',
			sql`case ${table.timingKind}
				when 'fixed' then
					${table.timingStart} is not null and ${table.timingEnd} is not null
					and ${isLocalTime(table.timingStart)} and ${isLocalTime(table.timingEnd)}
					and ${table.timingPrayer} is null and ${table.timingOffsetMinutes} is null
					and ${table.timingDurationMinutes} is null
				when 'prayer' then
					${table.timingPrayer} in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')
					and ${table.timingOffsetMinutes} between -120 and 240
					and ${table.timingDurationMinutes} between 5 and 1440
					and ${table.timingStart} is null and ${table.timingEnd} is null
				else false end`
		),
		...orgPolicies('course', table.organizationId, [table.updatedBy]),
		// Seuls les cours publiés, et seulement d'une organisation active. Un brouillon ou un cours
		// archivé est invisible du public par la base, pas par une clause qu'on pourrait oublier.
		publicSelect('course', table.organizationId, sql`${table.status} = 'published'`)
	]
);

export const courseTranslation = pgTable(
	'course_translation',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		courseId: uuid('course_id').notNull(),
		language: text().notNull(),
		title: text().notNull(),
		description: text(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.courseId, table.organizationId],
			foreignColumns: [course.id, course.organizationId],
			name: 'course_translation_course_fk'
		}).onDelete('cascade'),
		unique('course_translation_course_language_uq').on(table.courseId, table.language),
		index('course_translation_course_idx').on(table.courseId, table.organizationId),
		index('course_translation_organization_idx').on(table.organizationId),
		// Le site public et le flux agenda lisent les traductions d'une organisation dans une langue.
		index('course_translation_organization_language_idx').on(table.organizationId, table.language),
		ck('course_translation_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('course_translation_title_ck', sql`length(btrim(${table.title})) > 0`),
		...orgPolicies('course_translation', table.organizationId),
		publicSelect('course_translation', table.organizationId)
	]
);

export const sessionException = pgTable(
	'session_exception',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		courseId: uuid('course_id').notNull(),
		/** Date de la séance visée. */
		date: date().notNull(),
		kind: text().notNull(),
		/** `moved` : nouvelle date et nouvelle heure. */
		toDate: date('to_date'),
		toStart: time('to_start'),
		createdBy: uuid('created_by'),
		createdAt: createdAt()
	},
	(table) => [
		foreignKey({
			columns: [table.courseId, table.organizationId],
			foreignColumns: [course.id, course.organizationId],
			name: 'session_exception_course_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: 'session_exception_created_by_fk'
		}).onDelete('set null'),
		unique('session_exception_course_date_uq').on(table.courseId, table.date),
		index('session_exception_course_idx').on(table.courseId, table.organizationId),
		index('session_exception_created_by_idx').on(table.createdBy),
		index('session_exception_organization_date_idx').on(table.organizationId, table.date),
		ck('session_exception_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('session_exception_kind_ck', oneOf(table.kind, EXCEPTION_KINDS)),
		ck(
			'session_exception_shape_ck',
			sql`case ${table.kind}
				when 'cancelled' then ${table.toDate} is null and ${table.toStart} is null
				when 'moved' then ${table.toDate} is not null and ${table.toStart} is not null
					and ${isLocalTime(table.toStart)}
				else false end`
		),
		...orgPolicies('session_exception', table.organizationId, [table.createdBy]),
		publicSelect('session_exception', table.organizationId)
	]
);

export const pause = pgTable(
	'pause',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		/** Sans cours, la pause vaut pour toute l'organisation (ADR 0011). */
		courseId: uuid('course_id'),
		fromDate: date('from_date').notNull(),
		toDate: date('to_date').notNull(),
		reason: text(),
		createdBy: uuid('created_by'),
		createdAt: createdAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'pause_organization_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.courseId, table.organizationId],
			foreignColumns: [course.id, course.organizationId],
			name: 'pause_course_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: 'pause_created_by_fk'
		}).onDelete('set null'),
		// Les pauses sont toujours lues sur une plage de dates (ADR 0011).
		index('pause_organization_range_idx').on(table.organizationId, table.fromDate, table.toDate),
		index('pause_course_idx').on(table.courseId, table.organizationId),
		index('pause_created_by_idx').on(table.createdBy),
		ck('pause_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('pause_range_ck', sql`${table.toDate} >= ${table.fromDate}`),
		...orgPolicies('pause', table.organizationId, [table.createdBy]),
		publicSelect('pause', table.organizationId)
	]
);

// ---------------------------------------------------------------------------------------------
// Heures de prière (remplies à l'étape 7)
// ---------------------------------------------------------------------------------------------

export const prayerDay = pgTable(
	'prayer_day',
	{
		organizationId: uuid('organization_id').notNull(),
		date: date().notNull(),
		fajr: time().notNull(),
		dhuhr: time().notNull(),
		asr: time().notNull(),
		maghrib: time().notNull(),
		isha: time().notNull(),
		source: text().notNull(),
		createdAt: createdAt(),
		/**
		 * Recalculer un jour le met à jour sur place : sans cet horodatage, l'empreinte de cache des
		 * flux agenda ne bougerait pas et une organisation servirait ses anciennes heures pendant une
		 * heure (ADR 0026, étape 7).
		 */
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'prayer_day_organization_fk'
		}).onDelete('cascade'),
		// Une ligne par organisation et par date. La clé primaire composite tient lieu d'unicité,
		// d'index de lecture par plage de dates et de tête de la clé étrangère : la table compte une
		// ligne par jour et par organisation, c'est la plus volumineuse du schéma.
		primaryKey({ name: 'prayer_day_pk', columns: [table.organizationId, table.date] }),
		ck('prayer_day_source_ck', oneOf(table.source, PRAYER_SOURCES)),
		ck(
			'prayer_day_time_ck',
			sql`${isLocalTime(table.fajr)} and ${isLocalTime(table.dhuhr)} and ${isLocalTime(table.asr)}
				and ${isLocalTime(table.maghrib)} and ${isLocalTime(table.isha)}`
		),
		...orgPolicies('prayer_day', table.organizationId),
		publicSelect('prayer_day', table.organizationId)
	]
);

// ---------------------------------------------------------------------------------------------
// Périodes d'horaires (ADR 0004, étape 8)
//
// Ce que l'organisation décide elle-même, et qui passe avant tout le reste. Une période est ce
// qu'elle imprime sur son panneau : un nom, une date de début, une date de fin facultative, et pour
// chaque prière l'heure du soleil qu'elle affiche **et** l'heure d'iqama qu'elle appelle.
//
// Ce n'est pas une saisie jour par jour : personne ne remplit trois cent soixante-cinq jours. Une
// organisation qui règle un décalage d'iqama le fait une fois, sans date de fin ; une organisation
// qui affiche des heures fixes crée deux ou trois périodes par an, comme elle réimprime son panneau.
//
// Deux périodes d'une même organisation ne peuvent pas se chevaucher. C'est une **contrainte
// d'exclusion** de PostgreSQL, posée par une migration écrite à la main — Drizzle ne sait pas les
// émettre —, donc vraie quel que soit le chemin d'écriture.
export const prayerPeriod = pgTable(
	'prayer_period',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		/** Ce que l'organisation écrit sur son panneau : « Hiver 2027 », « Ramadan ». */
		name: text().notNull(),
		fromDate: date('from_date').notNull(),
		/** Vide vaut « jusqu'à nouvel ordre ». */
		toDate: date('to_date'),
		/**
		 * Vrai pour une période produite par « dupliquer pour l'année suivante » : ses dates ont été
		 * avancées de onze jours, ce qui est l'écart moyen entre une année grégorienne et une année
		 * lunaire. Onze jours **font gagner la saisie**, ils ne calculent pas une date religieuse —
		 * la marque le dit à l'écran, et elle ne s'efface que lorsqu'un responsable enregistre la
		 * période, c'est-à-dire lorsqu'il a regardé (étape 9).
		 */
		needsReview: boolean('needs_review').notNull().default(false),

		/** Heures du soleil affichées par l'organisation. Vide : l'import ou le calcul décide. */
		fajr: time(),
		dhuhr: time(),
		asr: time(),
		maghrib: time(),
		isha: time(),

		/** Iqama en heure fixe. Exclusive du décalage, prière par prière. */
		fajrIqama: time('fajr_iqama'),
		dhuhrIqama: time('dhuhr_iqama'),
		asrIqama: time('asr_iqama'),
		maghribIqama: time('maghrib_iqama'),
		ishaIqama: time('isha_iqama'),

		/** Iqama en décalage après l'heure du soleil, en minutes. */
		fajrIqamaOffset: smallint('fajr_iqama_offset'),
		dhuhrIqamaOffset: smallint('dhuhr_iqama_offset'),
		asrIqamaOffset: smallint('asr_iqama_offset'),
		maghribIqamaOffset: smallint('maghrib_iqama_offset'),
		ishaIqamaOffset: smallint('isha_iqama_offset'),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'prayer_period_organization_fk'
		}).onDelete('cascade'),
		unique('prayer_period_id_organization_uq').on(table.id, table.organizationId),
		index('prayer_period_organization_idx').on(table.organizationId, table.fromDate),
		ck('prayer_period_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('prayer_period_name_ck', sql`length(btrim(${table.name})) > 0 is true`),
		ck(
			'prayer_period_dates_ck',
			sql`${table.toDate} is null or ${table.toDate} >= ${table.fromDate}`
		),
		ck(
			'prayer_period_time_ck',
			sql`(${table.fajr} is null or ${isLocalTime(table.fajr)})
				and (${table.dhuhr} is null or ${isLocalTime(table.dhuhr)})
				and (${table.asr} is null or ${isLocalTime(table.asr)})
				and (${table.maghrib} is null or ${isLocalTime(table.maghrib)})
				and (${table.isha} is null or ${isLocalTime(table.isha)})`
		),
		ck(
			'prayer_period_iqama_time_ck',
			sql`(${table.fajrIqama} is null or ${isLocalTime(table.fajrIqama)})
				and (${table.dhuhrIqama} is null or ${isLocalTime(table.dhuhrIqama)})
				and (${table.asrIqama} is null or ${isLocalTime(table.asrIqama)})
				and (${table.maghribIqama} is null or ${isLocalTime(table.maghribIqama)})
				and (${table.ishaIqama} is null or ${isLocalTime(table.ishaIqama)})`
		),
		// Une iqama est une heure **ou** un décalage, jamais les deux : sinon rien ne dirait
		// laquelle des deux vaut, et la réponse dépendrait de l'ordre du `coalesce`.
		ck(
			'prayer_period_iqama_exclusive_ck',
			sql`num_nonnulls(${table.fajrIqama}, ${table.fajrIqamaOffset}) <= 1
				and num_nonnulls(${table.dhuhrIqama}, ${table.dhuhrIqamaOffset}) <= 1
				and num_nonnulls(${table.asrIqama}, ${table.asrIqamaOffset}) <= 1
				and num_nonnulls(${table.maghribIqama}, ${table.maghribIqamaOffset}) <= 1
				and num_nonnulls(${table.ishaIqama}, ${table.ishaIqamaOffset}) <= 1`
		),
		// Un décalage d'iqama suit toujours l'appel : jamais négatif, et deux heures suffisent.
		ck(
			'prayer_period_iqama_offset_ck',
			sql`(${table.fajrIqamaOffset} is null or ${table.fajrIqamaOffset} between 0 and 120)
				and (${table.dhuhrIqamaOffset} is null or ${table.dhuhrIqamaOffset} between 0 and 120)
				and (${table.asrIqamaOffset} is null or ${table.asrIqamaOffset} between 0 and 120)
				and (${table.maghribIqamaOffset} is null or ${table.maghribIqamaOffset} between 0 and 120)
				and (${table.ishaIqamaOffset} is null or ${table.ishaIqamaOffset} between 0 and 120)`
		),
		...orgPolicies('prayer_period', table.organizationId),
		publicSelect('prayer_period', table.organizationId)
	]
);

export const prayerSettings = pgTable(
	'prayer_settings',
	{
		organizationId: uuid('organization_id').primaryKey(),
		/**
		 * La position de l'organisation, en degrés décimaux, saisie à la main. Aucun géocodage : ce
		 * serait un service extérieur interrogé avec l'adresse d'une organisation (ADR 0009).
		 */
		latitude: doublePrecision(),
		longitude: doublePrecision(),
		/** Méthode de calcul d'`adhan`, parmi les treize qu'elle nomme (ADR 0004). */
		method: text(),
		/** L'école qui décide de la longueur d'ombre de l'Asr. */
		madhab: text().notNull().default('shafi'),
		/** La règle des latitudes hautes. Le défaut est celui qu'`adhan` recommande sous 48°. */
		highLatitudeRule: text('high_latitude_rule').notNull().default('middleofthenight'),
		/** Ajustement en minutes, prière par prière. */
		fajrAdjustment: smallint('fajr_adjustment').notNull().default(0),
		dhuhrAdjustment: smallint('dhuhr_adjustment').notNull().default(0),
		asrAdjustment: smallint('asr_adjustment').notNull().default(0),
		maghribAdjustment: smallint('maghrib_adjustment').notNull().default(0),
		ishaAdjustment: smallint('isha_adjustment').notNull().default(0),
		/** Source courante des heures : import CSV ou calcul. */
		source: text().notNull().default('import'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'prayer_settings_organization_fk'
		}).onDelete('cascade'),
		ck('prayer_settings_source_ck', oneOf(table.source, PRAYER_SOURCES)),
		ck('prayer_settings_madhab_ck', oneOf(table.madhab, MADHABS)),
		ck('prayer_settings_high_latitude_ck', oneOf(table.highLatitudeRule, HIGH_LATITUDE_RULES)),
		ck(
			'prayer_settings_method_ck',
			sql`${table.method} is null or ${oneOf(table.method, CALCULATION_METHODS)}`
		),
		// La position est soit absente, soit complète et sur Terre : une latitude sans longitude ne
		// calcule rien, et 47 sans décimale n'est pas une erreur — 470 en est une.
		ck(
			'prayer_settings_position_ck',
			sql`(${table.latitude} is null) = (${table.longitude} is null)
				and (${table.latitude} is null
					or (${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180))`
		),
		ck(
			'prayer_settings_adjustment_ck',
			sql`${table.fajrAdjustment} between -120 and 120
				and ${table.dhuhrAdjustment} between -120 and 120
				and ${table.asrAdjustment} between -120 and 120
				and ${table.maghribAdjustment} between -120 and 120
				and ${table.ishaAdjustment} between -120 and 120`
		),
		...orgPolicies('prayer_settings', table.organizationId)
	]
);

// ---------------------------------------------------------------------------------------------
// Journal d'audit : insertion seule (ADR 0015)
// ---------------------------------------------------------------------------------------------

export const auditLog = pgTable(
	'audit_log',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		actorId: uuid('actor_id'),
		action: text().notNull(),
		targetTable: text('target_table').notNull(),
		targetId: uuid('target_id'),
		/** État avant et après, pour le retour arrière. */
		before: jsonb(),
		after: jsonb(),
		createdAt: createdAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'audit_log_organization_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.actorId],
			foreignColumns: [user.id],
			name: 'audit_log_actor_fk'
		}).onDelete('set null'),
		index('audit_log_organization_created_at_idx').on(table.organizationId, table.createdAt),
		index('audit_log_actor_idx').on(table.actorId),
		ck('audit_log_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('audit_log_action_ck', sql`length(btrim(${table.action})) > 0`),
		// Ni UPDATE ni DELETE : aucune politique, et aucun droit accordé (ADR 0015).
		pgPolicy('audit_log_select', {
			as: 'permissive',
			for: 'select',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('audit_log_insert', {
			as: 'permissive',
			for: 'insert',
			to: appRole,
			withCheck: sql`${table.organizationId} = ${orgContext}
				and ${referencesVisibleUser(table.actorId)}`
		}),
		// Le super-admin lit et écrit le journal de l'organisation où il est entré, comme un
		// responsable (ADR 0025). Ses écritures y sont signées de son identité, avec l'état avant et
		// après. Ses **lectures** n'y laissent rien : elles vont au registre interne, que
		// l'organisation ne voit pas. C'est une décision explicite, et son prix est écrit dans
		// `docs/SECURITE.md`.
		pgPolicy('audit_log_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('audit_log_superadmin_insert', {
			as: 'permissive',
			for: 'insert',
			to: superAdminRole,
			withCheck: sql`${table.organizationId} = ${orgContext}`
		})
	]
);

// ---------------------------------------------------------------------------------------------
// Registre interne des accès du super-admin (ADR 0025)
//
// Il ne remplace pas le journal d'audit, il répond à une autre question. Le journal dit à une
// organisation ce qui a changé chez elle ; ce registre dit à l'exploitant ce que son compte
// super-admin a consulté, en cas de contestation. Une organisation n'y a accès ni directement ni
// indirectement : aucun droit n'est accordé au rôle applicatif, donc le refus tombe avant qu'une
// ligne soit examinée.
//
// Une entrée par requête, pas une par ligne lue.
// ---------------------------------------------------------------------------------------------

export const adminAccessLog = pgTable(
	'admin_access_log',
	{
		id: uuid().primaryKey(),
		/**
		 * L'organisation visitée, et son identifiant d'URL recopié. Ni clé étrangère ni cascade :
		 * une trace qui disparaîtrait avec l'organisation qu'elle décrit ne protégerait personne.
		 * C'est le seul endroit du schéma où une référence est volontairement laissée pendante.
		 */
		organizationId: uuid('organization_id'),
		organizationSlug: text('organization_slug'),
		/** Le compte super-admin qui a agi, pour la même raison sans clé étrangère. */
		actorId: uuid('actor_id').notNull(),
		/** Type d'action : `read`, `write`, `magic_link`… */
		action: text().notNull(),
		/** La route demandée, sans chaîne de requête. */
		route: text().notNull(),
		createdAt: createdAt()
	},
	(table) => [
		index('admin_access_log_created_at_idx').on(table.createdAt),
		index('admin_access_log_organization_idx').on(table.organizationId, table.createdAt),
		ck('admin_access_log_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('admin_access_log_action_ck', oneOf(table.action, ADMIN_ACCESS_ACTIONS)),
		ck('admin_access_log_route_ck', sql`length(btrim(${table.route})) > 0`),
		// Lisible et écrit par le seul super-admin. Le rôle applicatif n'a aucune politique ici, et
		// surtout aucun droit : `test/admin-access-log.test.ts` le prouve table par table.
		pgPolicy('admin_access_log_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`true`
		}),
		pgPolicy('admin_access_log_superadmin_insert', {
			as: 'permissive',
			for: 'insert',
			to: superAdminRole,
			withCheck: sql`true`
		})
	]
);

// ---------------------------------------------------------------------------------------------
// Compteur de vues (ADR 0032)
//
// Quatre colonnes, et rien d'autre : l'organisation, le jour, le type, le nombre. Aucune adresse,
// aucun identifiant, aucun en-tête de requête — et **aucune colonne d'horodatage**, ce qui est la
// seule entorse volontaire à la convention du schéma.
//
// La raison mérite d'être écrite, parce qu'elle n'est pas évidente : un `created_at` donnerait
// l'heure de la **première** vue du jour, un `updated_at` celle de la **dernière**. Pour une petite
// organisation qui fait une vue par jour, ce serait l'heure exacte à laquelle une personne a lu la
// page — c'est-à-dire précisément la donnée que ce compteur existe pour ne pas avoir.
//
// Le jour est la date **locale de l'organisation**, jamais la date UTC : sinon la soirée du vendredi
// d'une organisation de Bienne tomberait au samedi.
// ---------------------------------------------------------------------------------------------

export const pageView = pgTable(
	'page_view',
	{
		organizationId: uuid('organization_id').notNull(),
		day: date().notNull(),
		kind: text().notNull(),
		count: bigint({ mode: 'number' }).notNull().default(0)
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'page_view_organization_fk'
		}).onDelete('cascade'),
		// La clé primaire composite tient lieu d'unicité et d'index de lecture. `count` n'est
		// **pas** indexée, et ne doit jamais l'être : c'est ce qui permet à la ligne du jour d'être
		// mise à jour sur place des milliers de fois sans créer d'entrée d'index. Un index ajouté
		// plus tard pour « trier par popularité » détruirait cette propriété.
		primaryKey({ name: 'page_view_pk', columns: [table.organizationId, table.day, table.kind] }),
		ck('page_view_kind_ck', oneOf(table.kind, VIEW_KINDS)),
		ck('page_view_count_ck', sql`${table.count} >= 0`),
		// Les responsables lisent leurs propres chiffres, et ne les écrivent jamais : le compteur
		// n'est pas une donnée qu'on saisit. Le super-admin lit comme eux.
		pgPolicy('page_view_select', {
			as: 'permissive',
			for: 'select',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('page_view_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`
		})
		// Le rôle public n'a **aucune** politique ici, et aucun droit : il n'incrémente plus
		// lui-même. Il appelle `jadwal.count_view()`, une fonction du propriétaire qui ne sait faire
		// que cela (ADR 0032, révisé à l'étape 8). Un `select` du rôle public sur cette table échoue
		// donc sur un droit absent, comme sur le journal d'audit, et non sur une politique.
	]
);

// ---------------------------------------------------------------------------------------------
// Verrou de conservation (ADR 0030)
//
// Une ligne par organisation. Tant qu'elle existe, les politiques de purge du journal d'audit et du
// registre interne ne laissent plus rien supprimer pour cette organisation : la rétention de
// vingt-quatre mois est suspendue, le temps d'un litige.
//
// Deux choses en font une garantie plutôt qu'une intention. D'abord, aucun droit n'est accordé ici
// au rôle applicatif, au super-admin ni au rôle public : seul le propriétaire pose et lève un
// verrou, sous son drapeau d'entretien. Ensuite, la clé étrangère est en `restrict` et non en
// `cascade` : sans elle, supprimer l'organisation emporterait son journal, et le verrou n'aurait
// tenu que contre la purge — c'est-à-dire contre la seule voie qu'on n'avait pas besoin de fermer.
// ---------------------------------------------------------------------------------------------

export const retentionHold = pgTable(
	'retention_hold',
	{
		/** Une organisation, un verrou : l'identifiant est la clé. */
		organizationId: uuid('organization_id').primaryKey(),
		/** Pourquoi le verrou est posé. Obligatoire : un verrou sans motif ne se lève jamais. */
		reason: text().notNull(),
		/** Qui l'a posé, en toutes lettres. Texte libre : c'est l'exploitant qui s'engage ici. */
		placedBy: text('placed_by').notNull(),
		createdAt: createdAt()
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'retention_hold_organization_fk'
		}).onDelete('restrict'),
		ck('retention_hold_reason_ck', sql`length(btrim(${table.reason})) > 0`),
		ck('retention_hold_placed_by_ck', sql`length(btrim(${table.placedBy})) > 0`)
	]
);

// ---------------------------------------------------------------------------------------------
// Invitations (ADR 0017)
//
// Aucun jeton : la preuve, c'est la boîte aux lettres, et le lien magique l'établit déjà. Après
// s'être connectée, la personne voit les invitations adressées à son adresse et les accepte
// elle-même — c'est elle qui crée son adhésion, jamais l'organisation qui l'attache.
// ---------------------------------------------------------------------------------------------

export const INVITATION_STATUSES = ['pending', 'accepted', 'joined', 'cancelled'] as const;

export const invitation = pgTable(
	'invitation',
	{
		id: uuid().primaryKey(),
		organizationId: uuid('organization_id').notNull(),
		/** L'adresse telle qu'elle a été saisie. Aucun nom n'est affiché avant l'acceptation. */
		email: text().notNull(),
		role: text().notNull(),
		status: text().notNull().default('pending'),
		invitedBy: uuid('invited_by'),
		createdAt: createdAt(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
		/**
		 * Qui a accepté. Renseignée par la personne elle-même, à l'acceptation. C'est cette colonne,
		 * et elle seule, qui autorise ensuite la création de l'adhésion : la politique d'écriture de
		 * `membership` la lit par une fonction à droits du définisseur, ce qui évite la récursion
		 * qu'un passage par la table des comptes provoquerait (ADR 0017).
		 */
		acceptedBy: uuid('accepted_by')
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: 'invitation_organization_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [user.id],
			name: 'invitation_invited_by_fk'
		}).onDelete('set null'),
		// Une seule invitation en attente par adresse et par organisation. L'index partiel laisse
		// réinviter quelqu'un dont l'invitation a été annulée ou acceptée puis retirée.
		uniqueIndex('invitation_pending_uq')
			.on(table.organizationId, sql`lower(${table.email})`)
			.where(sql`${table.status} = 'pending'`),
		index('invitation_organization_idx').on(table.organizationId),
		index('invitation_email_idx').on(sql`lower(${table.email})`),
		foreignKey({
			columns: [table.acceptedBy],
			foreignColumns: [user.id],
			name: 'invitation_accepted_by_fk'
		}).onDelete('set null'),
		index('invitation_invited_by_idx').on(table.invitedBy),
		index('invitation_accepted_by_idx').on(table.acceptedBy),
		ck('invitation_id_uuid_v7_ck', isUuidV7(table.id)),
		ck('invitation_status_ck', oneOf(table.status, INVITATION_STATUSES)),
		ck('invitation_role_ck', oneOf(table.role, MEMBERSHIP_ROLES)),
		ck(
			'invitation_email_ck',
			sql`${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`
		),
		ck('invitation_expires_at_ck', sql`${table.expiresAt} > ${table.createdAt}`),
		// Les responsables gèrent les invitations de leur organisation…
		pgPolicy('invitation_select', {
			as: 'permissive',
			for: 'select',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}
				or exists (
					select 1 from "user" u
					where u."id" = ${userContext} and lower(u."email") = lower(${table.email})
				)`
		}),
		pgPolicy('invitation_insert', {
			as: 'permissive',
			for: 'insert',
			to: appRole,
			withCheck: sql`${table.organizationId} = ${orgContext}
				and ${referencesVisibleUser(table.invitedBy)}`
		}),
		// …et la personne invitée répond à la sienne, sans contexte d'organisation puisqu'elle n'en
		// est pas encore membre. Elle est reconnue par son adresse, que le lien magique a prouvée.
		pgPolicy('invitation_update', {
			as: 'permissive',
			for: 'update',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}
				or exists (
					select 1 from "user" u
					where u."id" = ${userContext} and lower(u."email") = lower(${table.email})
				)`,
			withCheck: sql`${table.organizationId} = ${orgContext}
				or exists (
					select 1 from "user" u
					where u."id" = ${userContext} and lower(u."email") = lower(${table.email})
				)`
		}),
		pgPolicy('invitation_delete', {
			as: 'permissive',
			for: 'delete',
			to: appRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		// Le super-admin invite et annule dans l'organisation où il est entré (ADR 0025).
		pgPolicy('invitation_superadmin_select', {
			as: 'permissive',
			for: 'select',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('invitation_superadmin_insert', {
			as: 'permissive',
			for: 'insert',
			to: superAdminRole,
			withCheck: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('invitation_superadmin_update', {
			as: 'permissive',
			for: 'update',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`,
			withCheck: sql`${table.organizationId} = ${orgContext}`
		}),
		pgPolicy('invitation_superadmin_delete', {
			as: 'permissive',
			for: 'delete',
			to: superAdminRole,
			using: sql`${table.organizationId} = ${orgContext}`
		})
	]
);

// ---------------------------------------------------------------------------------------------
// Connexion : les tables de Better Auth (ADR 0016)
//
// Elles ne portent pas d'organisation, et il n'y a rien à y cloisonner par organisation. Leur
// politique borne donc le RÔLE : seul `jadwal_auth` les touche, et le rôle applicatif ne reçoit
// aucun droit sur `session`, `account` et `verification` — un jeton de session ou un secret ne lui
// est pas seulement invisible, il lui est inaccessible.
// ---------------------------------------------------------------------------------------------

/** Toutes les opérations, pour le seul rôle de connexion. Ces tables n'ont pas d'organisation. */
function authPolicies(name: string) {
	return [
		pgPolicy(`${name}_auth_select`, {
			as: 'permissive',
			for: 'select',
			to: authRole,
			using: sql`true`
		}),
		pgPolicy(`${name}_auth_insert`, {
			as: 'permissive',
			for: 'insert',
			to: authRole,
			withCheck: sql`true`
		}),
		pgPolicy(`${name}_auth_update`, {
			as: 'permissive',
			for: 'update',
			to: authRole,
			using: sql`true`,
			withCheck: sql`true`
		}),
		pgPolicy(`${name}_auth_delete`, {
			as: 'permissive',
			for: 'delete',
			to: authRole,
			using: sql`true`
		})
	];
}

export const session = pgTable(
	'session',
	{
		id: uuid().primaryKey(),
		userId: uuid('user_id').notNull(),
		/** Jeton de session, signé dans le cookie ; c'est lui qui est cherché à chaque requête. */
		token: text().notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		/**
		 * L'organisation choisie après connexion, quand la personne en a plusieurs. Elle vit ici,
		 * côté serveur, et jamais dans l'URL ni dans un en-tête. Ce n'est pourtant pas elle qui
		 * fait autorité : l'appartenance est revérifiée à chaque requête, donc une valeur falsifiée
		 * ne donnerait accès à rien.
		 */
		activeOrganizationId: uuid('active_organization_id'),
		/**
		 * Renseignée quand la session a été ouverte par une passkey, jamais autrement. Les pouvoirs
		 * de super-admin l'exigent : un lien magique seul ne les donne pas, parce qu'une boîte aux
		 * lettres compromise ne doit pas suffire à devenir la clé maîtresse du service (ADR 0025).
		 */
		passkeyVerifiedAt: timestamp('passkey_verified_at', { withTimezone: true, mode: 'date' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'session_user_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.activeOrganizationId],
			foreignColumns: [organization.id],
			name: 'session_active_organization_fk'
		}).onDelete('set null'),
		uniqueIndex('session_token_uq').on(table.token),
		index('session_user_idx').on(table.userId),
		index('session_active_organization_idx').on(table.activeOrganizationId),
		...authPolicies('session')
	]
);

export const account = pgTable(
	'account',
	{
		id: uuid().primaryKey(),
		userId: uuid('user_id').notNull(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', {
			withTimezone: true,
			mode: 'date'
		}),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
			withTimezone: true,
			mode: 'date'
		}),
		scope: text(),
		/** Jamais renseignée : le produit n'a aucun mot de passe (ADR 0016). */
		password: text(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'account_user_fk'
		}).onDelete('cascade'),
		index('account_user_idx').on(table.userId),
		...authPolicies('account')
	]
);

/**
 * Les jetons de vérification. **Seule table du schéma dont l'identifiant n'est pas un UUID v7**, et
 * c'est une exception mesurée, pas un oubli (ADR 0014).
 *
 * Better Auth s'en sert aussi comme table de verrous : quand un lien magique aboutit à un compte
 * dont l'adresse n'était pas encore prouvée, il pose un verrou dont la **clé primaire est un
 * SHA-256** — « premier écrivain gagne », sans contrainte d'unicité à ajouter. Un identifiant de
 * quarante-trois caractères en base64url n'entre pas dans une colonne `uuid` : la connexion
 * échouait alors avec un code 500, pour tout compte créé à la main — dont celui du super-admin, que
 * la procédure d'amorçage crée précisément ainsi.
 */
export const verification = pgTable(
	'verification',
	{
		id: text().primaryKey(),
		/** Le jeton, stocké haché : le clair ne sort que dans le courriel (ADR 0016). */
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		index('verification_identifier_idx').on(table.identifier),
		index('verification_expires_at_idx').on(table.expiresAt),
		...authPolicies('verification')
	]
);

export const rateLimit = pgTable(
	'rate_limit',
	{
		id: uuid().primaryKey(),
		/** Clé du seau : l'adresse IP et le chemin, ou l'adresse électronique et le chemin. */
		key: text().notNull(),
		count: integer().notNull(),
		lastRequest: bigint('last_request', { mode: 'number' }).notNull()
	},
	(table) => [uniqueIndex('rate_limit_key_uq').on(table.key), ...authPolicies('rate_limit')]
);

/**
 * Les passkeys, telles que `@better-auth/passkey` les attend. Les noms de propriétés sont les
 * siens — `credentialID` avec ses deux majuscules comprises —, les noms de colonnes sont les
 * nôtres : l'adaptateur retrouve la colonne par la propriété, et c'est Drizzle qui écrit le SQL.
 *
 * Plusieurs passkeys par compte, voulu : perdre son téléphone ne doit pas fermer le service. La
 * procédure de secours, quand il n'en reste aucune, est manuelle et côté base (ADR 0025).
 */
export const passkey = pgTable(
	'passkey',
	{
		id: uuid().primaryKey(),
		name: text(),
		publicKey: text('public_key').notNull(),
		userId: uuid('user_id').notNull(),
		credentialID: text('credential_id').notNull(),
		counter: integer().notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: boolean('backed_up').notNull(),
		/** Liste séparée par des virgules, telle que le plugin la sérialise. */
		transports: text(),
		aaguid: text(),
		createdAt: createdAt()
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'passkey_user_fk'
		}).onDelete('cascade'),
		uniqueIndex('passkey_credential_uq').on(table.credentialID),
		index('passkey_user_idx').on(table.userId),
		ck('passkey_id_uuid_v7_ck', isUuidV7(table.id)),
		...authPolicies('passkey')
	]
);

/** Toutes les tables, pour les requêtes relationnelles de Drizzle. */
export const schema = {
	organization,
	user,
	membership,
	room,
	course,
	courseTranslation,
	sessionException,
	pause,
	prayerDay,
	prayerPeriod,
	prayerSettings,
	auditLog,
	adminAccessLog,
	pageView,
	retentionHold,
	invitation,
	session,
	account,
	verification,
	rateLimit,
	passkey
};
