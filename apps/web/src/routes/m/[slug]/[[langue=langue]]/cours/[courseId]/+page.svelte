<script lang="ts">
	import type { IsoDate } from '@jadwal/core';
	import {
		direction,
		LOCALE_DE_PARTAGE,
		longDate,
		numericDate,
		t,
		type Langue
	} from '$lib/i18n.js';
	import { lienAgenda, lienCours, lienVue } from '$lib/public/liens.js';
	import { PARAMETRE_APPAREIL, TOUS_LES_CHOIX } from '$lib/public/abonnement.js';
	import Abonnement from '$lib/public/Abonnement.svelte';
	import ChoixDeLangue from '$lib/public/ChoixDeLangue.svelte';
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

	/**
	 * Une session du vendredi parle d'une prière, et non d'un cours : ses prochaines dates, son
	 * abonnement, la langue du sermon et l'imam (étape 21, question 1 de l'étape 20). Le fil d'Ariane
	 * garde `Cours` : il nomme la vue où il mène, « Tous les cours », où la prière du vendredi a son
	 * groupe.
	 */
	const priere = $derived(data.cours.kind === 'jumua');
</script>

<svelte:head>
	<title>{data.cours.title} | {data.organisation.name}</title>
	<meta name="description" content={partage} />
	<meta property="og:title" content={data.cours.title} />
	<meta property="og:description" content={partage} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content={data.organisation.name} />
	<!-- Une langue et un pays, et chaque autre langue publiée (27.09.2026). -->
	<meta property="og:locale" content={LOCALE_DE_PARTAGE[data.langue]} />
	{#each data.langues.filter((autre) => autre !== data.langue) as autre (autre)}
		<meta property="og:locale:alternate" content={LOCALE_DE_PARTAGE[autre]} />
	{/each}
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
	<!-- Tout ce qui précède le pied est le contenu de la page, fil d'Ariane et choix de langue
	     compris : cette page n'a pas d'en-tête propre. Sans ce repère, axe relevait chacun de ses
	     blocs. -->
	<main>
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
				<dt>{priere ? mots.imam : mots.teacher}</dt>
				<dd>{data.cours.teacher}</dd>
			{/if}
			<dt>{priere ? mots.sermonLanguage : mots.taughtIn}</dt>
			<dd>{languesEnClair(data.langue, data.cours.teachingLanguages)}</dd>
			{#if data.cours.endsOn}
				<dt>{mots.datesLabel}</dt>
				<dd>
					{mots.fromTo(
						numericDate(data.cours.startsOn as IsoDate),
						numericDate(data.cours.endsOn as IsoDate)
					)}
				</dd>
			{/if}
		</dl>

		<!-- « Prochaines prières » pour une session du vendredi, « Prochaines séances » pour un cours
		     (étape 21). La marque de l'état suit aussi la sorte (étape 20, C4). -->
		<h2>{priere ? mots.nextPrayers : mots.nextSessions}</h2>
		{#if data.prochaines.length === 0}
			<p class="vide">{mots.noNextSessions}</p>
		{:else}
			<ul>
				{#each data.prochaines as seance (seance.date + seance.status)}
					<!-- Annulée, elle reste là, barrée, avec la marque de la vue Semaine (étape 19, lot 2) :
					     « Séance annulée » pour un cours, « Session annulée » pour une session du vendredi
					     (étape 20, C4). Déplacée puis annulée, elle l'est à sa nouvelle date et à sa nouvelle
					     heure, où l'expansion la rend. -->
					<li class:barree={seance.status === 'cancelled'}>
						{longDate(data.langue, seance.date as IsoDate)}
						<span class="heure">{heureDeSeance(data.langue, seance)}</span>
						{#if seance.status === 'cancelled'}<span class="marque"
								>{data.cours.kind === 'jumua' ? mots.cancelledJumua : mots.cancelled}</span
							>{/if}
						<!-- Déplacée le même jour, à une autre heure : un changement d'heure, et l'heure d'avant
						     quand elle est connue (relecture du lot 4). -->
						{#if seance.status === 'moved_here' && seance.originalDate === seance.date}
							<span class="marque">{mots.newTime}</span>
							{#if seance.originalStart}<span class="heure"
									>{mots.originallyAt(seance.originalStart)}</span
								>{/if}
						{:else if seance.status === 'moved_here'}
							<span class="marque"
								>{data.cours.kind === 'jumua'
									? mots.exceptionalDateJumua
									: mots.exceptionalDate}</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<!-- « Ajouter ce cours à mon agenda », ou « Ajouter cette prière à mon agenda » pour une session
		     du vendredi (étape 21), puis ce que l'appareil sait ouvrir (étape 18, retour E1).
		     L'ancre `#agenda` est celle où mène chaque cours depuis la page d'abonnement. -->
		<section id="agenda" aria-labelledby="agenda-titre">
			<h2 id="agenda-titre">{priere ? mots.addPrayerToCalendar : mots.addCourseToCalendar}</h2>
			<Abonnement
				langue={data.langue}
				appareil={data.appareil}
				webcal={data.flux.webcal}
				https={data.flux.https}
				nom={data.flux.nom}
				adresse={data.canonical}
				cours
				{priere}
				tousLesChoix={data.appareil === 'autre'
					? null
					: `${lienCours(adresse, data.cours.id)}?${PARAMETRE_APPAREIL}=${TOUS_LES_CHOIX}#agenda`}
			/>
		</section>

		<p class="liens">
			<a href={lienAgenda(adresse)}>{mots.subscribeWhole}</a>
			·
			<a href={lienVue(adresse)}>{mots.backToProgramme}</a>
		</p>

		<ChoixDeLangue
			slug={data.organisation.slug}
			langue={data.langue}
			langues={data.langues}
			lienLangue={versLangue}
			integre={data.integre}
		/>
	</main>

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
	.liens a {
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
</style>
