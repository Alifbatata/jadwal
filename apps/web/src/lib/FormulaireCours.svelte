<script lang="ts">
	import { untrack } from 'svelte';
	// Le formulaire de cours, partagé par la création et la modification.
	//
	// Le résumé en français se met à jour à mesure de la saisie quand JavaScript est là. Sans
	// JavaScript, il affiche l'état enregistré et le formulaire s'envoie quand même : le résumé est
	// un confort, jamais une condition (règle du dépôt).
	import {
		AUDIENCE_LABELS,
		LANGUAGE_LABELS,
		describeRecurrence,
		describeTiming
	} from './format.js';

	interface Valeurs {
		status: string;
		audience: string;
		teachingLanguages: string[];
		sourceLanguage: string;
		roomId: string | null;
		teacher: string | null;
		startsOn: string;
		endsOn: string | null;
		recurrenceKind: string;
		weekdays: number[];
		interval: number;
		monthlyWeekday: number;
		monthlyOrdinal: number;
		dates: string;
		timingKind: string;
		start: string;
		end: string;
		prayer: string;
		offsetMinutes: number;
		durationMinutes: number;
		titles: Record<string, string>;
		descriptions: Record<string, string>;
	}

	let {
		valeurs,
		langues,
		salles,
		action,
		libelleBouton
	}: {
		valeurs: Valeurs;
		langues: string[];
		salles: { id: string; name: string }[];
		action: string;
		libelleBouton: string;
	} = $props();

	// Une copie, volontairement figée au premier rendu : le formulaire est la source de vérité de
	// la saisie en cours, et le recharger depuis `valeurs` effacerait ce que la personne tape.
	let etat = $state({ ...untrack(() => valeurs) });
	let langueActive = $state(untrack(() => valeurs.sourceLanguage));

	const JOURS = [
		[1, 'lundi'],
		[2, 'mardi'],
		[3, 'mercredi'],
		[4, 'jeudi'],
		[5, 'vendredi'],
		[6, 'samedi'],
		[7, 'dimanche']
	] as const;

	const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

	const resume = $derived.by(() => {
		const rythme = describeRecurrence({
			kind: etat.recurrenceKind,
			weekdays: etat.weekdays,
			interval: etat.interval,
			ordinal: etat.monthlyOrdinal,
			ordinalWeekday: etat.monthlyWeekday,
			dates: etat.dates.split(/[\s,;]+/).filter((value) => value.length > 0)
		});
		const horaire = describeTiming({
			kind: etat.timingKind,
			start: etat.start,
			end: etat.end,
			prayer: etat.prayer,
			offsetMinutes: etat.offsetMinutes,
			durationMinutes: etat.durationMinutes
		});
		const titre = etat.titles[etat.sourceLanguage] || 'Ce cours';
		const public_ = AUDIENCE_LABELS[etat.audience] ?? etat.audience;
		const salle = salles.find((salle) => salle.id === etat.roomId)?.name;
		return `« ${titre} » a lieu ${rythme}, ${horaire}${salle ? `, ${salle}` : ''}, pour ${public_}.`;
	});

	function bascule(jour: number) {
		etat.weekdays = etat.weekdays.includes(jour)
			? etat.weekdays.filter((valeur) => valeur !== jour)
			: [...etat.weekdays, jour].sort((a, b) => a - b);
	}
</script>

<form method="post" {action} class="colonne">
	<p class="resume" role="status">{resume}</p>

	<fieldset>
		<legend>Texte du cours</legend>
		{#if langues.length > 1}
			<div class="onglets" role="tablist" aria-label="Langues">
				{#each langues as langue (langue)}
					<button
						type="button"
						role="tab"
						aria-selected={langueActive === langue}
						onclick={() => (langueActive = langue)}
					>
						{LANGUAGE_LABELS[langue] ?? langue}
						{#if langue === etat.sourceLanguage}(source){/if}
					</button>
				{/each}
			</div>
		{/if}
		{#each langues as langue (langue)}
			<!-- Les champs des autres langues restent dans la page : sans JavaScript, tout est
			     visible et saisissable d'un coup. -->
			<div class="onglet" class:masque={langues.length > 1 && langueActive !== langue}>
				<label for={`title-${langue}`}>
					Titre ({LANGUAGE_LABELS[langue] ?? langue})
					{#if langue === etat.sourceLanguage}*{/if}
				</label>
				<input
					id={`title-${langue}`}
					name={`title.${langue}`}
					type="text"
					maxlength="120"
					bind:value={etat.titles[langue]}
					required={langue === etat.sourceLanguage}
				/>
				<label for={`description-${langue}`}>
					Description ({LANGUAGE_LABELS[langue] ?? langue})
				</label>
				<textarea
					id={`description-${langue}`}
					name={`description.${langue}`}
					rows="3"
					bind:value={etat.descriptions[langue]}></textarea>
			</div>
		{/each}
		<label for="sourceLanguage">Langue de saisie</label>
		<select id="sourceLanguage" name="sourceLanguage" bind:value={etat.sourceLanguage}>
			{#each langues as langue (langue)}
				<option value={langue}>{LANGUAGE_LABELS[langue] ?? langue}</option>
			{/each}
		</select>
		<p class="aide">Les traductions sont facultatives. Aucune n’est faite automatiquement.</p>
	</fieldset>

	<fieldset>
		<legend>Public et langues d’enseignement</legend>
		<label for="audience">Public</label>
		<select id="audience" name="audience" bind:value={etat.audience}>
			{#each Object.entries(AUDIENCE_LABELS) as [valeur, libelle] (valeur)}
				<option value={valeur}>{libelle}</option>
			{/each}
		</select>
		<fieldset class="cases">
			<legend>Langues d’enseignement</legend>
			{#each langues as langue (langue)}
				<label class="case">
					<input
						type="checkbox"
						name="teachingLanguages"
						value={langue}
						checked={etat.teachingLanguages.includes(langue)}
					/>
					{LANGUAGE_LABELS[langue] ?? langue}
				</label>
			{/each}
		</fieldset>
	</fieldset>

	<fieldset>
		<legend>Rythme</legend>
		<label for="recurrenceKind">Rythme</label>
		<select id="recurrenceKind" name="recurrenceKind" bind:value={etat.recurrenceKind}>
			<option value="weekly">chaque semaine, ou une semaine sur deux</option>
			<option value="monthly">chaque mois</option>
			<option value="dates">à des dates précises</option>
		</select>

		{#if etat.recurrenceKind === 'weekly'}
			<fieldset class="cases">
				<legend>Jours</legend>
				{#each JOURS as [numero, nom] (numero)}
					<label class="case">
						<input
							type="checkbox"
							name="weekdays"
							value={numero}
							checked={etat.weekdays.includes(numero)}
							onchange={() => bascule(numero)}
						/>
						{nom}
					</label>
				{/each}
			</fieldset>
			<label for="interval">Fréquence</label>
			<select id="interval" name="interval" bind:value={etat.interval}>
				<option value={1}>chaque semaine</option>
				<option value={2}>une semaine sur deux</option>
			</select>
		{:else if etat.recurrenceKind === 'monthly'}
			<label for="monthlyOrdinal">Rang dans le mois</label>
			<select id="monthlyOrdinal" name="monthlyOrdinal" bind:value={etat.monthlyOrdinal}>
				<option value={1}>premier</option>
				<option value={2}>deuxième</option>
				<option value={3}>troisième</option>
				<option value={4}>quatrième</option>
				<option value={-1}>dernier</option>
			</select>
			<label for="monthlyWeekday">Jour</label>
			<select id="monthlyWeekday" name="monthlyWeekday" bind:value={etat.monthlyWeekday}>
				{#each JOURS as [numero, nom] (numero)}
					<option value={numero}>{nom}</option>
				{/each}
			</select>
		{:else}
			<label for="dates">Dates (une par ligne)</label>
			<textarea id="dates" name="dates" rows="4" bind:value={etat.dates}></textarea>
		{/if}
	</fieldset>

	<fieldset>
		<legend>Horaire</legend>
		<label for="timingKind">Horaire</label>
		<select id="timingKind" name="timingKind" bind:value={etat.timingKind}>
			<option value="fixed">heure fixe</option>
			<option value="prayer">après une prière</option>
		</select>

		{#if etat.timingKind === 'fixed'}
			<label for="start">Début</label>
			<input id="start" type="time" name="start" bind:value={etat.start} required />
			<label for="end">Fin</label>
			<input id="end" type="time" name="end" bind:value={etat.end} required />
		{:else}
			<label for="prayer">Prière</label>
			<select id="prayer" name="prayer" bind:value={etat.prayer}>
				{#each PRIERES as priere (priere)}
					<option value={priere}>{priere}</option>
				{/each}
			</select>
			<label for="offsetMinutes">Décalage (minutes, de -120 à 240)</label>
			<input
				id="offsetMinutes"
				type="number"
				name="offsetMinutes"
				min="-120"
				max="240"
				bind:value={etat.offsetMinutes}
			/>
			<label for="durationMinutes">Durée (minutes, de 5 à 1440)</label>
			<input
				id="durationMinutes"
				type="number"
				name="durationMinutes"
				min="5"
				max="1440"
				bind:value={etat.durationMinutes}
			/>
		{/if}
	</fieldset>

	<fieldset>
		<legend>Lieu, intervenant et période</legend>
		<label for="roomId">Salle</label>
		<select id="roomId" name="roomId" bind:value={etat.roomId}>
			<option value="">aucune</option>
			{#each salles as salle (salle.id)}
				<option value={salle.id}>{salle.name}</option>
			{/each}
		</select>
		<label for="teacher">Intervenant</label>
		<input id="teacher" type="text" name="teacher" maxlength="120" bind:value={etat.teacher} />
		<label for="startsOn">Premier jour</label>
		<input id="startsOn" type="date" name="startsOn" bind:value={etat.startsOn} required />
		<label for="endsOn">Dernier jour (facultatif)</label>
		<input id="endsOn" type="date" name="endsOn" bind:value={etat.endsOn} />
		<label for="status">État</label>
		<select id="status" name="status" bind:value={etat.status}>
			<option value="draft">brouillon</option>
			<option value="published">publié</option>
		</select>
	</fieldset>

	<button type="submit">{libelleBouton}</button>
</form>

<style>
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 32rem;
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	legend {
		font-weight: 600;
		padding: 0 0.35rem;
	}
	.cases {
		flex-direction: row;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.case {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		font-weight: 400;
	}
	label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	input,
	select,
	textarea,
	button {
		min-height: 44px;
		font: inherit;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	textarea {
		min-height: 5rem;
	}
	button[type='submit'] {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
	}
	.resume {
		background: #ecfdf5;
		border-left: 4px solid var(--accent);
		padding: 0.75rem;
		margin: 0;
	}
	.aide {
		font-size: 0.85rem;
		color: #555;
		margin: 0;
	}
	.onglets {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.onglets button {
		background: #f3f4f6;
		cursor: pointer;
	}
	.onglets button[aria-selected='true'] {
		background: var(--accent);
		color: var(--accent-texte);
	}
	.onglet {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.onglet.masque {
		display: none;
	}
</style>
