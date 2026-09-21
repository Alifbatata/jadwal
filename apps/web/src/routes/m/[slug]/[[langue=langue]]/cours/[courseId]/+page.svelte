<script lang="ts">
	import type { IsoDate } from '@jadwal/core';
	import { dateWithYear, direction, longDate, NOM_DE_LANGUE, t, type Langue } from '$lib/i18n.js';
	import { lienAgenda, lienCours, lienVue } from '$lib/public/liens.js';
	import Pied from '$lib/public/Pied.svelte';
	import { variablesAccent } from '$lib/couleur.js';
	import {
		heureDeSeance,
		horaireEnClair,
		languesEnClair,
		rythmeEnClair
	} from '$lib/public/affichage.js';

	let { data } = $props();
	const mots = $derived(t(data.langue));
	const dir = $derived(direction(data.langue));

	const adresse = $derived({
		slug: data.organisation.slug,
		langue: data.langue,
		langueParDefaut: data.organisation.defaultLanguage
	});

	const reperes = $derived(
		[
			rythmeEnClair(data.langue, data.cours),
			horaireEnClair(data.langue, data.cours),
			mots.audiences[data.cours.audience] ?? data.cours.audience
		].join(' · ')
	);

	/** La description, coupée à 200 caractères sur un espace (docs/maquettes/public-cours.md). */
	const partage = $derived.by(() => {
		const texte = data.cours.description ?? reperes;
		if (texte.length <= 200) return texte;
		const coupe = texte.slice(0, 200);
		const espace = coupe.lastIndexOf(' ');
		return `${espace > 100 ? coupe.slice(0, espace) : coupe}…`;
	});

	const versLangue = (langue: Langue) => lienCours({ ...adresse, langue }, data.cours.id);
</script>

<svelte:head>
	<title>{data.cours.title} — {data.organisation.name}</title>
	<meta name="description" content={partage} />
	<meta property="og:title" content={data.cours.title} />
	<meta property="og:description" content={partage} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content={data.organisation.name} />
	<meta property="og:locale" content={data.langue} />
	<meta property="og:url" content={data.canonical} />
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
	<p class="fil">
		<a href={lienVue(adresse)}>{data.organisation.name}</a> ›
		<a href={lienVue(adresse, { vue: 'cours' })}>{mots.coursesCrumb}</a>
	</p>

	<h1>{data.cours.title}</h1>
	<p class="reperes">{reperes}</p>

	{#if data.cours.description}
		<p>{data.cours.description}</p>
	{/if}

	<dl>
		{#if data.cours.room}
			<dt>{mots.place}</dt>
			<dd>{data.cours.room}</dd>
		{/if}
		{#if data.cours.teacher}
			<dt>{mots.teacher}</dt>
			<dd>{data.cours.teacher}</dd>
		{/if}
		<dt>{mots.taughtIn}</dt>
		<dd>{languesEnClair(data.langue, data.cours.teachingLanguages)}</dd>
		{#if data.cours.endsOn}
			<dt>{mots.datesLabel}</dt>
			<dd>
				{mots.fromTo(
					dateWithYear(data.langue, data.cours.startsOn as IsoDate),
					dateWithYear(data.langue, data.cours.endsOn as IsoDate)
				)}
			</dd>
		{/if}
	</dl>

	<h2>{mots.nextSessions}</h2>
	{#if data.prochaines.length === 0}
		<p class="vide">{mots.noNextSessions}</p>
	{:else}
		<ul>
			{#each data.prochaines as seance (seance.date + seance.status)}
				<li class:barree={seance.status === 'cancelled'}>
					{longDate(data.langue, seance.date as IsoDate)}
					<span class="heure">{heureDeSeance(data.langue, seance)}</span>
					{#if seance.status === 'cancelled'}<span class="marque">{mots.cancelled}</span>{/if}
					{#if seance.status === 'moved_here'}
						<span class="marque">{mots.exceptionalDate}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<p><a class="bouton" href={data.flux.webcal}>{mots.addCourseToCalendar}</a></p>
	<p class="adresse">{mots.courseFeedAddress}</p>
	<p class="lien"><code>{data.flux.https}</code></p>

	<p class="liens">
		<a href={lienAgenda(adresse)}>{mots.subscribeWhole}</a>
		·
		<a href={lienVue(adresse)}>{mots.backToProgramme}</a>
	</p>

	{#if data.langues.length > 1}
		<nav class="langues" aria-label="Langues">
			{#each data.langues as autre (autre)}
				<a
					href={versLangue(autre)}
					hreflang={autre}
					aria-current={autre === data.langue ? 'true' : undefined}
				>
					{NOM_DE_LANGUE[autre]}
				</a>
			{/each}
		</nav>
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
	.fil {
		font-size: 0.9rem;
		color: #555;
		margin: 0 0 0.5rem;
	}
	.fil a,
	.liens a,
	.langues a {
		color: #0f5c55;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	h1 {
		font-size: 1.4rem;
		margin: 0;
	}
	h2 {
		font-size: 1.1rem;
	}
	.reperes {
		color: #555;
		margin: 0.25rem 0 1rem;
	}
	dt {
		font-weight: 600;
		font-size: 0.85rem;
		color: #555;
	}
	dd {
		margin: 0 0 0.5rem;
	}
	ul {
		padding: 0;
	}
	li {
		list-style: none;
		padding: 0.3rem 0;
		border-bottom: 1px solid #eee;
	}
	li.barree {
		text-decoration: line-through;
	}
	.heure {
		color: #555;
		font-variant-numeric: tabular-nums;
	}
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0.05rem 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: none;
		display: inline-block;
	}
	.vide {
		color: #555;
	}
	.langues {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.95rem;
	}
	.bouton {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 1rem;
		border-radius: 0.375rem;
		background: var(--accent);
		color: var(--accent-texte);
		text-decoration: none;
		font-weight: 600;
	}
	.adresse {
		margin-bottom: 0.25rem;
		color: #555;
		font-size: 0.95rem;
	}
	.lien code {
		display: block;
		overflow-wrap: anywhere;
		background: #f6f6f6;
		padding: 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.9rem;
	}
</style>
