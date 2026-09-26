<script lang="ts">
	// L'onglet des prières de la page publique (étape 18, retour C4) : les heures du jour, celles des
	// sept jours, et les sessions du vendredi avec la langue de leur sermon. Montré seulement quand le
	// module des prières est allumé (ADR 0042).
	//
	// L'adhan est l'heure du soleil ; l'iqama, celle que l'organisation a réglée, quand elle en a
	// réglé une. Le vendredi, la prière du vendredi tient lieu de Dhuhr (ADR 0033) : ses sessions
	// prennent la place de l'iqama du Dhuhr, comme sur l'écran des prières de l'espace, et rien
	// d'autre de la table ne change.
	//
	// Une ligne datée dit ce qui a lieu **ce jour-là** (relecture du lot 3) : les sessions réelles de
	// la date, telles que la vue Semaine les montre. Une session annulée ou déplacée à un autre jour
	// reste écrite, barrée, avec le mot de la vue Semaine ; une session déplacée à une autre heure du
	// même jour n'est écrite qu'à sa nouvelle heure. Si aucune n'a lieu un vendredi, l'iqama du Dhuhr
	// revient. Le bloc du bas, sans date, garde le rythme habituel.
	//
	// Un autre jour qui reçoit une session du vendredi déplacée garde son iqama du Dhuhr, et la session
	// s'y écrit nommée, avec son vendredi d'origine, à sa place dans l'ordre des heures (relecture du
	// lot 4) : elle se lisait comme une troisième heure en gras, sans nom, après l'iqama même quand elle
	// venait avant l'adhan. Une aide le dit, quand le cas se présente.
	//
	// Un tableau de sept lignes et six colonnes tient sur un téléphone ; s'il ne tient pas, il défile
	// dans son cadre, et la page ne défile jamais de côté. Chaque case dit aux lecteurs d'écran ce
	// qu'est chacune de ses deux heures : l'œil a la phrase d'aide, l'oreille n'a que la case.
	import { isoDateToDays, weekdayFromDays, type IsoDate } from '@jadwal/core';
	import { longDate, t, type Langue } from '$lib/i18n.js';
	import { joindre, languesEnClair, nomPriere } from './affichage.js';

	interface Heure {
		priere: string;
		adhan: string | null;
		iqama: string | null;
	}

	/** Une session du vendredi à une date, telle que l'expansion la rend. */
	interface SeanceDuVendredi {
		id: string;
		start: string | null;
		/** `scheduled` et `moved_here` ont lieu ; `cancelled` et `moved_away`, non. */
		status: string;
		/** Pour une session déplacée : le jour où elle a lieu. */
		movedTo: string | null;
		/** Pour une session venue d'un autre jour : le vendredi où elle était prévue. */
		originalDate?: string | null;
	}

	/**
	 * Une ligne d'une case, dans l'ordre où elle se lit : l'adhan, l'iqama, une heure de la prière du
	 * vendredi qui tient lieu d'iqama, une session venue d'un vendredi, une session qui n'a pas lieu.
	 */
	type Ligne =
		| { genre: 'adhan'; heure: string | null }
		| { genre: 'iqama'; heure: string | null }
		| { genre: 'jumua'; heure: string }
		| { genre: 'venue'; seance: SeanceDuVendredi }
		| { genre: 'retiree'; seance: SeanceDuVendredi };

	interface Jour {
		date: string;
		heures: readonly Heure[];
		vendredi: readonly SeanceDuVendredi[];
	}

	let {
		langue,
		today,
		jours,
		sessions
	}: {
		langue: Langue;
		today: string;
		/** Les jours que couvre au moins une source, dans l'ordre, aujourd'hui compris. */
		jours: readonly Jour[];
		/** Les sessions du vendredi, dans leur ordre, avec la langue de leur sermon : le rythme habituel. */
		sessions: readonly {
			id: string;
			start: string;
			sermonLanguages: string[];
			room: string | null;
		}[];
	} = $props();

	const mots = $derived(t(langue));
	const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

	/**
	 * La prière du vendredi d'un jour, dans la case du Dhuhr : les sessions qui ont lieu, celles qui
	 * n'ont pas lieu, et si les premières remplacent l'iqama (un vendredi seulement). Un autre jour,
	 * celles qui ont lieu sont venues d'un vendredi : elles s'ajoutent, nommées, sans prendre la place
	 * du Dhuhr de ce jour.
	 */
	function vendrediDu(jour: Jour) {
		const ontLieu = jour.vendredi.filter(
			(seance) => seance.status === 'scheduled' || seance.status === 'moved_here'
		);
		const nOntPasLieu = jour.vendredi.filter(
			(seance) =>
				seance.status === 'cancelled' ||
				(seance.status === 'moved_away' && seance.movedTo !== jour.date)
		);
		const vendredi = weekdayFromDays(isoDateToDays(jour.date as IsoDate)) === 5;
		return {
			ontLieu,
			nOntPasLieu,
			remplaceIqama: vendredi && ontLieu.length > 0,
			heures: vendredi ? ontLieu.map((seance) => seance.start ?? '–') : [],
			venues: vendredi ? [] : ontLieu
		};
	}

	/**
	 * Les heures d'une case, et chaque session venue d'un vendredi placée avant la première heure plus
	 * tardive qu'elle : l'ordre des heures, sans changer celui de l'adhan et de l'iqama. Une session
	 * sans heure connue vient en dernier.
	 */
	function dansLOrdre(fixes: readonly Ligne[], venues: readonly SeanceDuVendredi[]): Ligne[] {
		const lignes: Ligne[] = [];
		let suivante = 0;
		for (const fixe of fixes) {
			const heure = 'heure' in fixe ? fixe.heure : null;
			for (; suivante < venues.length; suivante += 1) {
				const debut = venues[suivante]?.start ?? null;
				if (debut === null || heure === null || debut >= heure) break;
				lignes.push({ genre: 'venue', seance: venues[suivante] as SeanceDuVendredi });
			}
			lignes.push(fixe);
		}
		for (const seance of venues.slice(suivante)) lignes.push({ genre: 'venue', seance });
		return lignes;
	}

	/** Les lignes d'une case du tableau de la semaine. */
	function lignesDeLaCase(heure: Heure, vendredi: ReturnType<typeof vendrediDu>): Ligne[] {
		const fixes: Ligne[] = [{ genre: 'adhan', heure: heure.adhan }];
		if (heure.priere !== 'dhuhr') {
			if (heure.iqama) fixes.push({ genre: 'iqama', heure: heure.iqama });
			return fixes;
		}
		if (vendredi.remplaceIqama) {
			for (const debut of vendredi.heures) fixes.push({ genre: 'jumua', heure: debut });
		} else if (heure.iqama) {
			fixes.push({ genre: 'iqama', heure: heure.iqama });
		}
		return [
			...dansLOrdre(fixes, vendredi.venues),
			...vendredi.nOntPasLieu.map((seance): Ligne => ({ genre: 'retiree', seance }))
		];
	}

	/** Le mot de la vue Semaine pour une session qui n'a pas lieu : annulée, ou déplacée à tel jour. */
	function statut(seance: SeanceDuVendredi): string {
		return seance.status === 'moved_away' && seance.movedTo
			? mots.movedTo(longDate(langue, seance.movedTo as IsoDate))
			: mots.cancelled;
	}

	const aujourdhui = $derived(jours.find((jour) => jour.date === today));
	const vendrediDuJour = $derived(aujourdhui ? vendrediDu(aujourdhui) : null);
	const unVendredi = $derived(
		jours.some((jour) => {
			const vendredi = vendrediDu(jour);
			return vendredi.ontLieu.length + vendredi.nOntPasLieu.length > 0;
		})
	);
	const uneVenue = $derived(jours.some((jour) => vendrediDu(jour).venues.length > 0));
	/** Le vendredi où était prévue une session venue d'un autre jour, dans les mots de la vue Semaine. */
	const origine = (seance: SeanceDuVendredi) =>
		seance.originalDate
			? mots.originallyOn(longDate(langue, seance.originalDate as IsoDate))
			: null;
</script>

<!-- Une session venue d'un vendredi : son nom et son heure, puis le vendredi où elle était prévue.
     L'espace entre les deux est hors du bloc `if` : Svelte retire celle qu'on écrit au début d'un
     bloc. -->
{#snippet venue(seance: SeanceDuVendredi)}
	{mots.jumuaAt(seance.start ?? '–')}
	{#if origine(seance)}<span class="marque">{origine(seance)}</span>{/if}
{/snippet}

<p class="aide">{mots.prayersHelp}</p>

{#if jours.length === 0}
	<p class="vide">{mots.noPrayerTimes}</p>
{/if}

{#if aujourdhui}
	<section aria-labelledby="prieres-aujourdhui">
		<h2 id="prieres-aujourdhui">{mots.prayersToday(longDate(langue, today as IsoDate))}</h2>
		<table class="aujourdhui">
			<thead>
				<tr>
					<th scope="col">{mots.prayerColumn}</th>
					<th scope="col">{mots.adhan}</th>
					<th scope="col">{mots.iqama}</th>
				</tr>
			</thead>
			<tbody>
				{#each aujourdhui.heures as heure (heure.priere)}
					<tr>
						<th scope="row">{nomPriere(langue, heure.priere)}</th>
						<td>{heure.adhan ?? '–'}</td>
						<td>
							{#if heure.priere === 'dhuhr' && vendrediDuJour?.remplaceIqama}
								{mots.jumuaAt(joindre(langue, vendrediDuJour.heures))}
							{:else}
								<!-- Un autre jour que le vendredi, une session venue d'un vendredi se place avant
								     ou après l'iqama, selon son heure. -->
								{#each dansLOrdre([{ genre: 'iqama', heure: heure.iqama }], heure.priere === 'dhuhr' ? (vendrediDuJour?.venues ?? []) : []) as ligne, index (index)}
									{#if ligne.genre === 'venue'}
										<span class="ligne">{@render venue(ligne.seance)}</span>
									{:else if heure.iqama}
										{heure.iqama}
									{:else}
										<span aria-hidden="true">–</span><span class="pour-lecteur">{mots.noIqama}</span
										>
									{/if}
								{/each}
							{/if}
							{#if heure.priere === 'dhuhr' && vendrediDuJour}
								{#each vendrediDuJour.nOntPasLieu as seance, index (index)}
									<span class="ligne"
										><s>{mots.jumuaAt(seance.start ?? '–')}</s>
										<span class="marque">{statut(seance)}</span></span
									>
								{/each}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

{#if jours.length > 0}
	<section aria-labelledby="prieres-semaine">
		<h2 id="prieres-semaine">{mots.prayersWeek}</h2>
		<p class="aide">{mots.weekBoxHelp}</p>
		{#if unVendredi}<p class="aide">{mots.fridayBoxHelp}</p>{/if}
		{#if uneVenue}<p class="aide">{mots.movedJumuaHelp}</p>{/if}
		<div class="defile">
			<table class="semaine">
				<thead>
					<tr>
						<th scope="col">{mots.dayColumn}</th>
						{#each PRIERES as priere (priere)}
							<th scope="col">{nomPriere(langue, priere)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each jours as jour (jour.date)}
						{@const vendredi = vendrediDu(jour)}
						<tr class:courant={jour.date === today}>
							<th scope="row" aria-current={jour.date === today ? 'date' : undefined}>
								{longDate(langue, jour.date as IsoDate)}
							</th>
							{#each jour.heures as heure (heure.priere)}
								<td>
									{#each lignesDeLaCase(heure, vendredi) as ligne, index (index)}
										{#if ligne.genre === 'adhan'}
											{#if ligne.heure}
												<span class="adhan"
													><span class="pour-lecteur">{`${mots.adhan} `}</span>{ligne.heure}</span
												>
											{:else}
												<span aria-hidden="true">–</span>
											{/if}
										{:else if ligne.genre === 'iqama'}
											<span class="iqama"
												><span class="pour-lecteur">{`${mots.iqama} `}</span>{ligne.heure}</span
											>
										{:else if ligne.genre === 'jumua'}
											<span class="jumua"
												><span class="pour-lecteur">{`${mots.jumua} `}</span>{ligne.heure}</span
											>
										{:else if ligne.genre === 'venue'}
											<!-- Son nom et son vendredi se lisent : une heure seule ne dirait pas ce
											     qu'elle est. -->
											<span class="jumua">{@render venue(ligne.seance)}</span>
										{:else}
											<span class="jumua retiree"
												><span class="pour-lecteur">{`${mots.jumua} `}</span><s
													>{ligne.seance.start ?? '–'}</s
												>
												<span class="marque">{statut(ligne.seance)}</span></span
											>
										{/if}
									{/each}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}

{#if sessions.length > 0}
	<section id="prieres-vendredi" aria-labelledby="prieres-vendredi-titre">
		<h2 id="prieres-vendredi-titre">{mots.jumua}</h2>
		<p class="aide">{mots.jumuaReplacesDhuhr}</p>
		<ul>
			{#each sessions as session (session.id)}
				<li>
					<span class="heure">{session.start}</span>
					<span class="detail"
						>{mots.sermonIn(languesEnClair(langue, session.sermonLanguages))}</span
					>
					{#if session.room}<span class="detail">{session.room}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	h2 {
		font-size: 1.1rem;
		margin: 1.25rem 0 0.25rem;
	}
	.aide {
		color: #555;
		font-size: 0.95rem;
		margin: 0.25rem 0 0.5rem;
	}
	.vide {
		color: #555;
		background: #f6f6f6;
		padding: 0.75rem;
		border-radius: 0.5rem;
	}
	table {
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		border-bottom: 1px solid #eee;
		padding: 0.35rem 0.4rem;
		text-align: start;
		vertical-align: top;
	}
	thead th {
		font-size: 0.8rem;
		color: #555;
		font-weight: 600;
	}
	table.aujourdhui {
		min-width: 60%;
	}
	table.aujourdhui td {
		font-size: 1.05rem;
	}
	/* Le tableau de la semaine défile dans son cadre s'il ne tient pas : la page, jamais. */
	.defile {
		overflow-x: auto;
	}
	table.semaine {
		width: 100%;
		font-size: 0.85rem;
	}
	table.semaine tbody th {
		font-weight: 400;
	}
	/* Aujourd'hui : la graisse, et `aria-current` pour qui ne la voit pas. */
	tr.courant th {
		font-weight: 700;
	}
	.adhan,
	.iqama,
	.jumua {
		display: block;
	}
	.iqama {
		color: #555;
	}
	.jumua {
		font-weight: 700;
	}
	/* Une session qui n'a pas lieu ce jour-là : l'heure barrée, et le mot de la vue Semaine, dans la
	   même pastille. Le mot se lit, la couleur ne fait que l'accompagner (WCAG 1.4.1). */
	.jumua.retiree {
		font-weight: 400;
	}
	.ligne {
		display: block;
	}
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0.05rem 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid #eee;
		font-variant-numeric: tabular-nums;
	}
	.heure {
		font-weight: 700;
	}
	/* Un séparateur en CSS, jamais dans le texte : un lecteur d'écran lit le point médian. */
	.heure + .detail::before,
	.detail + .detail::before {
		content: '· ';
	}
	.pour-lecteur {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
