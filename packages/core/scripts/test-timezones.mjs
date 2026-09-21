// Rejoue la suite de tests de @jadwal/core sous plusieurs fuseaux de machine (variable TZ) et
// vérifie que les résultats sont identiques : mêmes tests, mêmes statuts, tout au vert.
// Portable Windows / Linux : lance Vitest avec l'exécutable Node courant, sans shell.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZONES = ['UTC', 'Europe/Zurich', 'America/Los_Angeles', 'Pacific/Kiritimati'];

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const vitest = join(packageDir, 'node_modules', 'vitest', 'vitest.mjs');
const outDir = mkdtempSync(join(tmpdir(), 'jadwal-core-tz-'));

/** @type {Map<string, { success: boolean, passed: number, total: number, lines: string[] }>} */
const summaries = new Map();

/**
 * Vérifie qu'un processus enfant lancé avec cette variable TZ adopte réellement le fuseau demandé.
 * Sans ce contrôle, un nom mal orthographié ou une plateforme qui ignore TZ ferait passer la
 * comparaison pour concluante alors que les quatre exécutions partagent le même fuseau.
 */
function assertZoneApplied(zone) {
	const probe = spawnSync(
		process.execPath,
		['-e', 'process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)'],
		{ env: { ...process.env, TZ: zone }, encoding: 'utf8' }
	);
	if (probe.error) throw probe.error;
	const resolved = probe.stdout.trim();
	if (resolved !== zone) {
		throw new Error(`TZ=${zone} n'a pas été appliqué : le processus enfant résout ${resolved}`);
	}
}

try {
	for (const zone of ZONES) {
		const outputFile = join(outDir, `${zone.replaceAll('/', '_')}.json`);
		console.log(`\n=== TZ=${zone} ===`);
		assertZoneApplied(zone);
		const run = spawnSync(
			process.execPath,
			[vitest, 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${outputFile}`],
			{
				cwd: packageDir,
				env: { ...process.env, TZ: zone },
				stdio: ['ignore', 'inherit', 'inherit']
			}
		);
		if (run.error) throw run.error;
		const report = JSON.parse(readFileSync(outputFile, 'utf8'));
		const lines = report.testResults
			.flatMap((file) =>
				file.assertionResults.map(
					(test) =>
						`${relative(packageDir, file.name).replaceAll('\\', '/')} > ${test.fullName} : ${test.status}`
				)
			)
			.sort();
		summaries.set(zone, {
			success: report.success && run.status === 0,
			passed: report.numPassedTests,
			total: report.numTotalTests,
			lines
		});
	}
} finally {
	rmSync(outDir, { recursive: true, force: true });
}

console.log('\n=== Comparaison des fuseaux ===');
let ok = true;
const reference = summaries.get(ZONES[0]);
for (const zone of ZONES) {
	const summary = summaries.get(zone);
	const identical =
		summary.lines.length === reference.lines.length &&
		summary.lines.every((line, index) => line === reference.lines[index]);
	const status = summary.success && identical ? 'OK' : 'ECHEC';
	if (status !== 'OK') ok = false;
	console.log(
		`${status.padEnd(5)} TZ=${zone.padEnd(20)} ${summary.passed}/${summary.total} tests passés` +
			(identical ? ', résultats identiques à UTC' : ', RÉSULTATS DIFFÉRENTS de UTC')
	);
	if (!identical) {
		const missing = reference.lines.filter((line) => !summary.lines.includes(line));
		const extra = summary.lines.filter((line) => !reference.lines.includes(line));
		for (const line of missing) console.log(`  - ${line}`);
		for (const line of extra) console.log(`  + ${line}`);
	}
}
process.exitCode = ok ? 0 : 1;
