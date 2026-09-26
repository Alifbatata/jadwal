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

	let {
		langue,
		today,
		jours,
		sessions
	}: {
		langue: Langue;
		today: string;
		/** Les jours que couvre au moins une source, dans l'ordre, aujourd'hui compris. */
		jours: readonly { date: string; heures: readonly Heure[] }[];
		/** Les sessions du vendredi, dans leur ordre, avec la langue de leur sermon. */
		sessions: readonly {
			id: string;
			start: string;
			sermonLanguages: string[];
			room: string | null;
		}[];
	} = $props();

	const mots = $derived(t(langue));
	const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

	/** Vrai un vendredi, quand l'organisation a des sessions : ce sont elles qui tiennent lieu de Dhuhr. */
	function jumua(date: string, priere: string): boolean {
		return (
			priere === 'dhuhr' &&
			sessions.length > 0 &&
			weekdayFromDays(isoDateToDays(date as IsoDate)) === 5
		);
	}

	const aujourdhui = $derived(jours.find((jour) => jour.date === today));
	const unVendredi = $derived(jours.some((jour) => jumua(jour.date, 'dhuhr')));
	const heuresDesSessions = $derived(sessions.map((session) => session.start));
</script>

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
							{#if jumua(today, heure.priere)}
								{mots.jumuaAt(joindre(langue, heuresDesSessions))}
							{:else if heure.iqama}
								{heure.iqama}
							{:else}
								<span aria-hidden="true">–</span><span class="pour-lecteur">{mots.noIqama}</span>
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
						<tr class:courant={jour.date === today}>
							<th scope="row" aria-current={jour.date === today ? 'date' : undefined}>
								{longDate(langue, jour.date as IsoDate)}
							</th>
							{#each jour.heures as heure (heure.priere)}
								<td>
									{#if heure.adhan}
										<span class="adhan"
											><span class="pour-lecteur">{mots.adhan} </span>{heure.adhan}</span
										>
									{:else}
										<span aria-hidden="true">–</span>
									{/if}
									{#if jumua(jour.date, heure.priere)}
										{#each sessions as session (session.id)}
											<span class="jumua"
												><span class="pour-lecteur">{mots.jumua} </span>{session.start}</span
											>
										{/each}
									{:else if heure.iqama}
										<span class="iqama"
											><span class="pour-lecteur">{mots.iqama} </span>{heure.iqama}</span
										>
									{/if}
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
