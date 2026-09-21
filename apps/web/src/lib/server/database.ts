// Les connexions du serveur, une par rôle, ouvertes une fois pour le processus.
//
// Deux rôles, deux pools, et c'est la séparation elle-même qui protège : `auth` ne touche qu'aux
// tables de session, `app` ne touche qu'aux données d'organisation et n'a aucun droit sur les
// jetons. Un défaut dans l'un ne donne pas les pouvoirs de l'autre (ADR 0016).

import { createDatabase, loadDotEnv, type Database, type DatabaseHandle } from '@jadwal/db';

// En développement, le fichier `.env` de la racine ; en production, l'environnement du serveur,
// qui gagne toujours sur le fichier.
loadDotEnv();

let authHandle: DatabaseHandle | undefined;
let appHandle: DatabaseHandle | undefined;
let superAdminHandle: DatabaseHandle | undefined;

/** Connexion du sous-système de connexion. Elle n'a aucun droit sur les données d'organisation. */
export function authDatabase(): Database {
	authHandle ??= createDatabase({ role: 'auth' });
	return authHandle.db;
}

/**
 * Connexion applicative. Elle ne voit rien tant qu'une transaction n'a pas posé son contexte
 * d'organisation : c'est `withSessionOrg` qui le fait, à partir de la session vérifiée.
 */
export function appDatabase(): Database {
	appHandle ??= createDatabase({ role: 'app' });
	return appHandle.db;
}

/**
 * Connexion du super-admin. Elle ouvre et ferme les organisations, et ne lit les données d'une
 * organisation que pendant une fenêtre d'accès de support déclarée (ADR 0018). Elle n'a aucun droit
 * d'écriture sur ces données.
 */
export function superAdminDatabase(): Database {
	superAdminHandle ??= createDatabase({ role: 'superadmin' });
	return superAdminHandle.db;
}

/** Ferme les pools. Utile aux tests ; le serveur, lui, vit aussi longtemps que le processus. */
export async function closeDatabases(): Promise<void> {
	await Promise.all([authHandle?.close(), appHandle?.close(), superAdminHandle?.close()]);
	authHandle = undefined;
	appHandle = undefined;
	superAdminHandle = undefined;
}
