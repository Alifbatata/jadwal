<script lang="ts">
	import { addDays, isoDateToDays, weekdayFromDays, type IsoDate } from '@jadwal/core';
	import { direction, longDate, monthName, t, type Langue } from '$lib/i18n.js';
	import { lienAgenda, lienCours, lienVue } from '$lib/public/liens.js';
	import Entete from '$lib/public/Entete.svelte';
	import Pied from '$lib/public/Pied.svelte';
	import { variablesAccent } from '$lib/couleur.js';
	import Vendredi from '$lib/public/Vendredi.svelte';
	import Seance from '$lib/public/Seance.svelte';
	import { horaireEnClair, languesEnClair, rythmeEnClair } from '$lib/public/affichage.js';

	let { data } = $props();
	const mots = $derived(t(data.langue));
	const dir = $derived(direction(data.langue));

	/** Toutes les adresses de cette page passent par `resolve` (voir $lib/public/liens.ts). */
	const adresse = $derived({
		slug: data.organisation.slug,
		langue: data.langue,
		langueParDefaut: data.organisation.defaultLanguage
	});

	function vers(options: {
		vue?: string;
		public?: string | null;
		mois?: string | null;
		jour?: string | null;
		langue?: Langue;
	}): string {
		const vue = options.vue ?? data.vue;
		const mois = options.mois === undefined ? data.premierDuMois?.slice(0, 7) : options.mois;
		return lienVue(options.langue ? { ...adresse, langue: options.langue } : adresse, {
			vue: vue === 'semaine' ? null : vue,
			public: options.public === undefined ? data.filtre : options.public,
			mois: vue === 'mois' ? (mois ?? null) : null,
			jour: options.jour ?? null
		});
	}

	const versCours = (courseId: string) => lienCours(adresse, courseId);

	/** Les séances groupées par jour, dans l'ordre. Un jour sans séance n'est pas affiché. */
	const parJour = $derived.by(() => {
		const groupes: [string, typeof data.seances][] = [];
		for (const seance of data.seances) {
			const trouve = groupes.find(([date]) => date === seance.date);
			if (trouve) trouve[1].push(seance);
			else groupes.push([seance.date, [seance]]);
		}
		return groupes.sort(([a], [b]) => (a < b ? -1 : 1));
	});

	/** Le message d'une semaine vide : il doit dire pourquoi (étape 5, partie A). */
	const messageVide = $derived.by(() => {
		if (data.pause) {
			return data.pause.reason ? mots.emptyPauseNamed(data.pause.reason) : mots.emptyPause;
		}
		if (data.aucunCoursPublie) return mots.emptyNotPublished;
		return data.filtre ? mots.emptyFilter : mots.emptyWeek;
	});

	/**
	 * Les cours groupés par rythme, dans l'ordre de la maquette, **précédés** du groupe de la prière
	 * du vendredi. Les sessions ne sont pas mêlées aux cours : leur rythme se lit autrement, et
	 * elles sont ce qu'on vient chercher (docs/maquettes/public-vendredi.md).
	 */
	const RYTHMES = ['weekly', 'fortnightly', 'monthly', 'dates'] as const;
	const parRythme = $derived.by(() => {
		const sessions = data.cours
			.filter((cours) => cours.kind === 'jumua')
			.sort((a, b) => (a.jumuaOrder ?? 0) - (b.jumuaOrder ?? 0));
		const groupes = RYTHMES.map((rythme) => ({
			rythme: rythme as string,
			titre: mots.rhythms[rythme] ?? rythme,
			cours: data.cours.filter((cours) => {
				if (cours.kind === 'jumua') return false;
				if (cours.recurrenceKind === 'weekly') {
					return rythme === (cours.recurrenceInterval === 2 ? 'fortnightly' : 'weekly');
				}
				return rythme === (cours.recurrenceKind === 'monthly' ? 'monthly' : 'dates');
			})
		}));
		return [{ rythme: 'jumua', titre: mots.jumua, cours: sessions }, ...groupes].filter(
			(groupe) => groupe.cours.length > 0
		);
	});

	/** Les prochaines dates d'un cours, prises dans l'expansion déjà faite côté serveur. */
	function prochaines(courseId: string, combien: number) {
		return data.seances
			.filter((seance) => seance.courseId === courseId && seance.status !== 'cancelled')
			.slice(0, combien);
	}

	/** La grille du mois : des semaines de sept jours, du lundi au dimanche. */
	const grille = $derived.by(() => {
		if (data.vue !== 'mois' || !data.premierDuMois) return [];
		const premier = data.premierDuMois as IsoDate;
		const decalage = weekdayFromDays(isoDateToDays(premier)) - 1;
		const debut = addDays(premier, -decalage);
		const semaines: { date: IsoDate; dansLeMois: boolean; seances: number }[][] = [];
		for (let semaine = 0; semaine < 6; semaine += 1) {
			const jours = Array.from({ length: 7 }, (_, index) => {
				const date = addDays(debut, semaine * 7 + index);
				return {
					date,
					dansLeMois: date.slice(0, 7) === premier.slice(0, 7),
					seances: data.seances.filter(
						(seance) => seance.date === date && seance.status !== 'moved_away'
					).length
				};
			});
			if (jours.some((jour) => jour.dansLeMois)) semaines.push(jours);
		}
		return semaines;
	});

	const moisPrecedent = $derived(data.premierDuMois ? decalerMois(data.premierDuMois, -1) : null);
	const moisSuivant = $derived(data.premierDuMois ? decalerMois(data.premierDuMois, 1) : null);

	function decalerMois(premier: string, pas: number): string {
		const [annee, mois] = premier.split('-').map(Number);
		const total = (annee as number) * 12 + ((mois as number) - 1) + pas;
		const a = Math.floor(total / 12);
		const m = (total % 12) + 1;
		return `${a}-${String(m).padStart(2, '0')}`;
	}

	const seancesDuJour = $derived(
		data.jourChoisi ? data.seances.filter((seance) => seance.date === data.jourChoisi) : []
	);

	const titre = $derived(
		data.vue === 'cours'
			? `${data.organisation.name} — ${mots.coursesTitle}`
			: data.vue === 'mois' && data.premierDuMois
				? `${data.organisation.name} — ${monthName(data.langue, Number(data.premierDuMois.slice(0, 4)), Number(data.premierDuMois.slice(5, 7)))}`
				: `${data.organisation.name} — ${mots.weekTitle}`
	);
</script>

<svelte:head>
	<title>{titre}</title>
	<meta name="description" content={`${mots.weekTitle} — ${data.organisation.name}`} />
	<meta property="og:title" content={data.organisation.name} />
	<meta property="og:description" content={`${mots.weekTitle} — ${data.organisation.name}`} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={data.organisation.name} />
	<meta property="og:locale" content={data.langue} />
	<meta property="og:url" content={data.canonical} />
	<!-- L'adresse canonique et les versions linguistiques, en absolu (ADR 0029). Les liens du
	     sélecteur de langue ne les remplacent pas : un `hreflang` sur un `<a>` n'est pas une
	     annotation de version linguistique. -->
	<link rel="canonical" href={data.canonical} />
	{#each data.alternates as autre (autre.hreflang)}
		<link rel="alternate" hreflang={autre.hreflang} href={autre.href} />
	{/each}
</svelte:head>

<div
	{dir}
	lang={data.langue}
	class="page"
	style={variablesAccent(data.organisation.accentColor)}
	data-jadwal-embed={data.integre ? '' : undefined}
>
	<Entete
		nom={data.organisation.name}
		langue={data.langue}
		langues={data.langues}
		vue={data.vue}
		filtre={data.filtre}
		lienVue={(vue) => vers({ vue })}
		lienFiltre={(audience) => vers({ public: audience })}
		lienLangue={(autre) => vers({ langue: autre })}
	>
		{#snippet vendredi()}
			<Vendredi langue={data.langue} sessions={data.vendredi} />
		{/snippet}
	</Entete>

	{#if data.vue === 'semaine'}
		<p class="periode">
			{mots.period(
				longDate(data.langue, data.from as IsoDate),
				longDate(data.langue, data.to as IsoDate)
			)}
		</p>
		{#if parJour.length === 0}
			<p class="vide">{messageVide}</p>
		{/if}
		{#each parJour as [date, seances] (date)}
			<section>
				<h2>
					{longDate(data.langue, date as IsoDate)}
					{#if date === data.today}<span class="aujourdhui">{mots.today}</span>{/if}
				</h2>
				<ul>
					{#each seances as seance (seance.courseId + seance.date + seance.status)}
						<Seance {seance} langue={data.langue} lienCours={versCours} />
					{/each}
				</ul>
			</section>
		{/each}
	{:else if data.vue === 'cours'}
		{#if parRythme.length === 0}
			<p class="vide">{mots.noCourses}</p>
		{/if}
		{#each parRythme as groupe (groupe.rythme)}
			<section>
				<h2>{groupe.titre}</h2>
				{#each groupe.cours as cours (cours.id)}
					<details id={`cours-${cours.id}`}>
						<summary>
							<strong>{cours.title}</strong>
							<span class="details">
								{rythmeEnClair(data.langue, cours)} · {horaireEnClair(data.langue, cours)} ·
								{mots.audiences[cours.audience] ?? cours.audience}
							</span>
						</summary>
						{#if cours.description}<p>{cours.description}</p>{/if}
						<dl>
							{#if cours.room}
								<dt>{mots.place}</dt>
								<dd>{cours.room}</dd>
							{/if}
							{#if cours.teacher}
								<dt>{mots.teacher}</dt>
								<dd>{cours.teacher}</dd>
							{/if}
							<dt>{mots.taughtIn}</dt>
							<dd>{languesEnClair(data.langue, cours.teachingLanguages)}</dd>
						</dl>
						<p class="details">
							{mots.nextSessions} :
							{#if prochaines(cours.id, 3).length === 0}
								{mots.noNextSessions}
							{:else}
								{prochaines(cours.id, 3)
									.map((seance) => longDate(data.langue, seance.date as IsoDate))
									.join(', ')}
							{/if}
						</p>
						<p><a href={versCours(cours.id)}>{mots.coursesCrumb}</a></p>
					</details>
				{/each}
			</section>
		{/each}
	{:else if data.premierDuMois}
		<nav class="mois" aria-label={mots.views.month}>
			<a href={vers({ vue: 'mois', mois: moisPrecedent, jour: null })}>‹ {mots.previousMonth}</a>
			<strong>
				{monthName(
					data.langue,
					Number(data.premierDuMois.slice(0, 4)),
					Number(data.premierDuMois.slice(5, 7))
				)}
			</strong>
			<a href={vers({ vue: 'mois', mois: moisSuivant, jour: null })}>{mots.nextMonth} ›</a>
		</nav>

		<table>
			<thead>
				<tr>
					{#each mots.shortWeekdays as jour (jour)}
						<th scope="col">{jour}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each grille as semaine, index (index)}
					<tr>
						{#each semaine as jour (jour.date)}
							<td
								class:hors={!jour.dansLeMois}
								class:courant={jour.date === data.today}
								aria-current={jour.date === data.today ? 'date' : undefined}
							>
								{#if jour.dansLeMois}
									{#if jour.seances > 0}
										<a href={vers({ vue: 'mois', jour: jour.date })}>
											<span class="numero">{Number(jour.date.slice(8, 10))}</span>
											<span class="compte">{mots.sessionCount(jour.seances)}</span>
										</a>
									{:else}
										<span class="numero">{Number(jour.date.slice(8, 10))}</span>
									{/if}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		{#if data.seances.length === 0}
			<p class="vide">{mots.emptyMonth}</p>
		{/if}

		{#if data.jourChoisi}
			<section>
				<h2>{longDate(data.langue, data.jourChoisi as IsoDate)}</h2>
				{#if seancesDuJour.length === 0}
					<p class="vide">{mots.emptyDay}</p>
				{:else}
					<ul>
						{#each seancesDuJour as seance (seance.courseId + seance.date + seance.status)}
							<Seance {seance} langue={data.langue} lienCours={versCours} />
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}

	<Pied langue={data.langue} lienAgenda={lienAgenda(adresse)} integre={data.integre} />
</div>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
		color: #1a1a1a;
	}
	h2 {
		font-size: 1.1rem;
		margin: 1.25rem 0 0.25rem;
	}
	ul {
		margin: 0;
		padding: 0;
	}
	.periode {
		color: #555;
		margin: 0;
	}
	.vide {
		color: #555;
		background: #f6f6f6;
		padding: 0.75rem;
		border-radius: 0.5rem;
	}
	/* La pastille « aujourd'hui » : la couleur sert de fond, et le mot reste écrit. La couleur n'est
	   donc jamais le seul indicateur de l'état (WCAG 1.4.1). */
	.aujourdhui {
		font-size: 0.8rem;
		font-weight: 600;
		background: var(--accent);
		color: var(--accent-texte);
		border-radius: 0.75rem;
		padding: 0.1rem 0.5rem;
	}
	details {
		border-bottom: 1px solid #eee;
		padding: 0.5rem 0;
	}
	summary {
		cursor: pointer;
		min-height: 44px;
	}
	.details {
		color: #555;
		font-size: 0.9rem;
	}
	dl {
		margin: 0.5rem 0;
	}
	dt {
		font-weight: 600;
		font-size: 0.85rem;
		color: #555;
	}
	dd {
		margin: 0 0 0.35rem;
	}
	nav.mois {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	nav.mois a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: #0f5c55;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.5rem;
	}
	th {
		font-size: 0.75rem;
		color: #555;
		font-weight: 600;
		padding: 0.25rem 0;
	}
	td {
		border: 1px solid #eee;
		height: 3.25rem;
		vertical-align: top;
		padding: 0.15rem;
		width: 14.28%;
	}
	td.hors {
		background: #fafafa;
	}
	/* Le jour courant : un liseré ne suffirait pas — c'est le numéro qui prend le fond d'accent, et
	   la case porte `aria-current` pour qui ne voit pas la couleur. */
	td.courant .numero {
		background: var(--accent);
		color: var(--accent-texte);
		border-radius: 0.75rem;
		font-weight: 700;
	}
	td a {
		display: block;
		min-height: 44px;
		color: #0f5c55;
		text-decoration: none;
	}
	.numero {
		display: block;
		font-variant-numeric: tabular-nums;
	}
	.compte {
		display: block;
		font-size: 0.7rem;
		color: #0f5c55;
	}
</style>
