<script lang="ts">
	// La vue « Aujourd'hui » de la page publique (étape 24, ADR 0052 et 0053,
	// docs/maquettes/public-aujourdhui.md) : les prières du jour et la prochaine, les séances du jour,
	// puis le premier jour suivant qui en a. C'est sur elle que s'ouvre l'application installée.
	//
	// Rien n'y bouge : la page n'a pas de script, et la prochaine prière est celle de l'instant où la
	// page a été demandée. Ce que la vue décide est dans `aujourdhui.ts`, et le tableau du jour est
	// celui de l'onglet des prières, rendu par le même composant.
	import type { IsoDate } from '@jadwal/core';
	import { longDate, t, type Langue } from '#lib/i18n.js';
	import { joindre, nomPriere } from './affichage.js';
	import type { Prochaine } from './aujourdhui.js';
	import Prieres from './Prieres.svelte';
	import Seance from './Seance.svelte';

	type SeanceVue = import('svelte').ComponentProps<typeof Seance>['seance'];
	type Jours = import('svelte').ComponentProps<typeof Prieres>['jours'];

	let {
		langue,
		today,
		prieres,
		prochaine,
		seances,
		jourSuivant,
		pause,
		aucunCoursPublie,
		lienCours,
		lienPrieres,
		lienSemaine
	}: {
		langue: Langue;
		today: string;
		/** Les heures du jour même, ou rien : module éteint, ou aucune heure publiée. */
		prieres: Jours;
		prochaine: Prochaine;
		/** Les séances des sept jours, dans l'ordre : la vue y prend aujourd'hui et le jour suivant. */
		seances: readonly SeanceVue[];
		/** Le premier jour suivant qui a des séances, s'il y en a un dans les six jours. */
		jourSuivant: string | null;
		pause: { reason: string | null } | null;
		aucunCoursPublie: boolean;
		lienCours: (courseId: string) => string;
		lienPrieres: string;
		lienSemaine: string;
	} = $props();

	const mots = $derived(t(langue));
	const avecHeures = $derived(prieres.some((jour) => jour.date === today));
	const duJour = $derived(seances.filter((seance) => seance.date === today));
	const ensuite = $derived(
		jourSuivant ? seances.filter((seance) => seance.date === jourSuivant) : []
	);

	/** La phrase de la prochaine prière, ou rien quand aucune heure à venir n'est connue. */
	const phrase = $derived.by(() => {
		if (!prochaine) return null;
		if (prochaine.genre === 'jumua') return mots.nextPrayerJumua(joindre(langue, prochaine.heures));
		const nom = nomPriere(langue, prochaine.priere);
		if (prochaine.genre === 'demain') return mots.nextPrayerTomorrow(nom, prochaine.adhan);
		return prochaine.iqama
			? mots.nextPrayerIqama(nom, prochaine.adhan, prochaine.iqama)
			: mots.nextPrayer(nom, prochaine.adhan);
	});

	/** Un jour sans séance dit pourquoi, comme la vue Semaine. */
	const messageVide = $derived.by(() => {
		if (pause) return pause.reason ? mots.todayPauseNamed(pause.reason) : mots.todayPause;
		return aucunCoursPublie ? mots.emptyNotPublished : mots.todayEmpty;
	});
</script>

{#if avecHeures}
	<Prieres
		{langue}
		{today}
		jours={prieres}
		sessions={[]}
		seulementLeJour
		{phrase}
		lienSemaine={lienPrieres}
	/>
{/if}

<!-- Sans heure de prière, c'est ce bloc qui porte le jour en titre. -->
<section id="aujourdhui-programme" aria-labelledby="aujourdhui-programme-titre">
	<h2 id="aujourdhui-programme-titre">
		{avecHeures ? mots.todayProgramme : mots.prayersToday(longDate(langue, today as IsoDate))}
	</h2>
	{#if duJour.length === 0}
		<p class="vide">{messageVide}</p>
	{:else}
		<ul>
			{#each duJour as seance (seance.courseId + seance.date + seance.status)}
				<Seance {seance} {langue} {lienCours} />
			{/each}
		</ul>
	{/if}
</section>

<section id="aujourdhui-suite" aria-labelledby="aujourdhui-suite-titre">
	<h2 id="aujourdhui-suite-titre">{mots.comingUp}</h2>
	{#if jourSuivant}
		<h3>{longDate(langue, jourSuivant as IsoDate)}</h3>
		<ul>
			{#each ensuite as seance (seance.courseId + seance.date + seance.status)}
				<Seance {seance} {langue} {lienCours} />
			{/each}
		</ul>
	{/if}
	<p class="suite"><a href={lienSemaine}>{mots.wholeWeek}</a></p>
</section>

<style>
	h2 {
		font-size: 1.1rem;
		margin: 1.25rem 0 0.25rem;
	}
	h3 {
		font-size: 1rem;
		margin: 0.5rem 0 0.25rem;
	}
	ul {
		margin: 0;
		padding: 0;
	}
	.vide {
		color: #555;
		background: #f6f6f6;
		padding: 0.75rem;
		border-radius: 0.5rem;
	}
	.suite {
		margin: 0.5rem 0 0;
	}
	.suite a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: #0f5c55;
	}
</style>
