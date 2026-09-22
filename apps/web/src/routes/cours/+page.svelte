<script lang="ts">
	import { resolve } from '$app/paths';
	import type { IsoDate } from '@jadwal/core';
	import { AUDIENCE_LABELS, describeRecurrence, describeTiming, shortDate } from '$lib/format.js';

	let { data, form } = $props();

	const STATUTS: Record<string, string> = {
		draft: 'brouillon',
		published: 'publié',
		archived: 'archivé'
	};
</script>

<svelte:head><title>Cours | {data.organisation.name}</title></svelte:head>

<h1>Cours</h1>

{#if form?.erreur}<p class="erreur" role="alert">{form.erreur}</p>{/if}

<p><a class="bouton" href={resolve('/cours/nouveau')}>Nouveau cours</a></p>

{#if data.courses.length === 0}
	<p class="vide">Aucun cours pour l’instant.</p>
{/if}

<ul>
	{#each data.courses as course (course.id)}
		<li>
			<p class="titre">
				{course.title}
				<span class="statut">{STATUTS[course.status] ?? course.status}</span>
			</p>
			<p class="details">
				{describeRecurrence(course.recurrence)}, {describeTiming(course.timing)}
			</p>
			<p class="details">
				{AUDIENCE_LABELS[course.audience] ?? course.audience}
				{#if course.room}· {course.room}{/if}
				{#if course.teacher}· {course.teacher}{/if}
			</p>
			<p>
				<a href={resolve('/cours/[id]', { id: course.id })}>Modifier</a>
			</p>
		</li>
	{/each}
</ul>

<section aria-labelledby="pauses-titre">
	<h2 id="pauses-titre">Pauses</h2>
	<p class="details">
		Une période sans séance : vacances, Ramadan, travaux. Sans cours choisi, elle vaut pour toute
		l’organisation.
	</p>

	{#if data.pauses.length > 0}
		<ul>
			{#each data.pauses as pause (pause.id)}
				<li>
					<p class="titre">
						{pause.course ?? 'Toute l’organisation'}
					</p>
					<p class="details">
						Du {shortDate(pause.from as IsoDate)} au {shortDate(pause.to as IsoDate)}
						{#if pause.reason}· {pause.reason}{/if}
					</p>
					<form method="post" action="?/supprimerPause">
						<input type="hidden" name="pauseId" value={pause.id} />
						<button type="submit">Supprimer cette pause</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="post" action="?/pause" class="colonne">
		<label for="pause-course">Cours concerné</label>
		<select id="pause-course" name="courseId">
			<option value="">Toute l’organisation</option>
			{#each data.courses as course (course.id)}
				<option value={course.id}>{course.title}</option>
			{/each}
		</select>

		<label for="pause-from">Du</label>
		<input id="pause-from" type="date" name="from" required />

		<label for="pause-to">Au</label>
		<input id="pause-to" type="date" name="to" required />

		<label for="pause-reason">Motif (facultatif)</label>
		<input id="pause-reason" type="text" name="reason" maxlength="120" />

		<button type="submit">Poser la pause</button>
	</form>
</section>

<style>
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.titre {
		font-weight: 600;
		margin: 0;
	}
	.details {
		color: #555;
		font-size: 0.95rem;
		margin: 0.25rem 0 0;
	}
	.statut {
		font-size: 0.8rem;
		background: #e5e7eb;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
	}
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 24rem;
	}
	button,
	select,
	input,
	.bouton {
		min-height: 44px;
		font: inherit;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	button,
	.bouton {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}
	label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
	.vide {
		color: #555;
	}
</style>
