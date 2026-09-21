<script lang="ts">
	// Une séance, dans la forme décrite par docs/maquettes/README.md : heure, titre, public, salle,
	// intervenant. Annulée, elle reste visible et barrée ; déplacée, elle porte la mention qui dit
	// où elle va ou d'où elle vient.
	import { longDate, t, type Langue } from '$lib/i18n.js';
	import { heureDeSeance, languesEnClair } from './affichage.js';
	import type { IsoDate } from '@jadwal/core';

	interface SeanceVue {
		courseId: string;
		date: string;
		start: string | null;
		end: string | null;
		status: string;
		anchor: { prayer: string; offsetMinutes: number } | null;
		movedTo: { date: string; start: string } | null;
		originalDate: string | null;
		title: string;
		audience: string;
		room: string | null;
		teacher: string | null;
		/** `course` ou `jumua` : seule la dernière ligne change (ADR 0033). */
		kind?: string;
		/** Langues du sermon, pour une session du vendredi. */
		sermonLanguages?: string[];
	}

	let {
		seance,
		langue,
		lienCours
	}: { seance: SeanceVue; langue: Langue; lienCours: (courseId: string) => string } = $props();

	const mots = $derived(t(langue));
	const barree = $derived(seance.status === 'cancelled' || seance.status === 'moved_away');
</script>

<li class:barree>
	<p class="ligne">
		<span class="heure">{heureDeSeance(langue, seance)}</span>
		<a class="titre" href={lienCours(seance.courseId)}>{seance.title}</a>
		{#if seance.status === 'cancelled'}<span class="marque">{mots.cancelled}</span>{/if}
		{#if seance.status === 'moved_here'}<span class="marque">{mots.exceptionalDate}</span>{/if}
		{#if seance.status === 'moved_away' && seance.movedTo}
			<span class="marque">{mots.movedTo(longDate(langue, seance.movedTo.date as IsoDate))}</span>
		{/if}
	</p>
	<p class="details">
		{mots.audiences[seance.audience] ?? seance.audience}
		{#if seance.room}· {seance.room}{/if}
		{#if seance.teacher}· {seance.teacher}{/if}
		{#if seance.kind === 'jumua' && seance.sermonLanguages && seance.sermonLanguages.length > 0}
			· {mots.sermonIn(languesEnClair(langue, seance.sermonLanguages))}
		{/if}
		{#if seance.status === 'moved_here' && seance.originalDate}
			· {mots.originallyOn(longDate(langue, seance.originalDate as IsoDate))}
		{/if}
	</p>
</li>

<style>
	li {
		list-style: none;
		padding: 0.4rem 0;
		border-bottom: 1px solid #eee;
	}
	.ligne {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
	}
	.heure {
		font-variant-numeric: tabular-nums;
		color: #333;
		min-width: 7.5rem;
	}
	.titre {
		font-weight: 600;
		color: #0f5c55;
	}
	li.barree .heure,
	li.barree .titre {
		text-decoration: line-through;
	}
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0.05rem 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.details {
		margin: 0.15rem 0 0;
		color: #555;
		font-size: 0.9rem;
	}
</style>
