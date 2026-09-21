// L'alerte par courriel, hors de l'application (ADR 0036).
//
// Ce fichier n'appartient pas à `apps/web` : il est monté dans un conteneur jetable tiré de l'image
// de production, et il n'y emprunte que `nodemailer` et les variables SMTP. La raison est simple —
// une alerte doit partir **quand l'application ne répond plus**, ce qui est le cas de loin le plus
// fréquent. Un envoi qui passerait par le serveur SvelteKit ne servirait que lorsqu'on n'en a pas
// besoin.
//
// Le sujet est le premier argument, le corps arrive sur l'entrée standard :
//   echo "la sauvegarde d'hier n'est jamais partie" | node /app/jadwal-mail.mjs "jadwal : sauvegarde"
//
// Il ne dépend d'aucune variable qui ne soit déjà nécessaire au service, sauf `JADWAL_ALERTE_TO`.

import { createTransport } from 'nodemailer';

const requis = (nom) => {
	const valeur = process.env[nom];
	if (!valeur) {
		process.stderr.write(`${nom} manque : impossible d'envoyer l'alerte\n`);
		process.exit(2);
	}
	return valeur;
};

const sujet = process.argv[2] ?? 'jadwal : alerte';

const corps = await new Promise((resolve, reject) => {
	const morceaux = [];
	process.stdin.on('data', (morceau) => morceaux.push(morceau));
	process.stdin.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
	process.stdin.on('error', reject);
});

const port = Number(process.env['SMTP_PORT'] ?? '587');
const transport = createTransport({
	host: requis('SMTP_HOST'),
	port,
	secure: port === 465,
	// Même exigence que dans l'application : sur 587, STARTTLS est obligatoire, y compris si le
	// serveur oublie de l'annoncer. Sans cela les identifiants passeraient en clair.
	requireTLS: port !== 465,
	connectionTimeout: 10_000,
	greetingTimeout: 10_000,
	socketTimeout: 20_000,
	auth: { user: requis('SMTP_USER'), pass: requis('SMTP_PASSWORD') }
});

const expediteur = process.env['MAIL_FROM_NAME']
	? `${process.env['MAIL_FROM_NAME']} <${requis('MAIL_FROM')}>`
	: requis('MAIL_FROM');

try {
	await transport.sendMail({
		from: expediteur,
		...(process.env['MAIL_REPLY_TO'] ? { replyTo: process.env['MAIL_REPLY_TO'] } : {}),
		to: requis('JADWAL_ALERTE_TO'),
		subject: sujet,
		text: `${corps.trimEnd()}\n\n-- \njadwal, un service de Voltia\n${process.env['JADWAL_ORIGIN'] ?? ''}\n`
	});
	process.stdout.write('alerte envoyée\n');
} catch (erreur) {
	// L'échec de l'alerte est lui-même une information : il part dans le journal de l'unité, que la
	// veille relit. Un `exit 1` suffit à ce que systemd le marque en échec.
	process.stderr.write(
		`alerte non envoyée : ${erreur instanceof Error ? erreur.message : erreur}\n`
	);
	process.exit(1);
} finally {
	transport.close();
}
