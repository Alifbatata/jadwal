<script lang="ts">
	import { onMount, untrack } from 'svelte';
	// Le formulaire de cours, partagé par la création et la modification, dans la langue de l'espace.
	//
	// Le résumé en haut reprend tout ce qui sera publié, signale ce qui manque et marque « à
	// corriger » ce que le serveur refuserait (retour B4). Il se met à jour à mesure de la saisie
	// quand JavaScript est là. Sans JavaScript, le serveur le calcule par la même fonction : il montre
	// l'état enregistré, ou, après un envoi refusé, ce que la personne vient d'envoyer. Le formulaire
	// s'envoie de toute façon : le résumé est un confort, jamais une condition (règle du dépôt).
	import {
		MAX_DURATION_MINUTES,
		MAX_OFFSET_MINUTES,
		MIN_DURATION_MINUTES,
		MIN_OFFSET_MINUTES,
		type IsoDate
	} from '@jadwal/core';
	import {
		firstDate,
		summarise,
		textDirection,
		TIMING_CHOICES,
		type CourseFormError,
		type CourseFormValues,
		type DateRange
	} from './course-form.js';
	import { audienceLabels, joinList, languageLabel, prayerLabel } from './format.js';
	import { numericDate, t, type Langue } from './i18n.js';
	import { courseFormTexts } from './i18n/course-form.js';

	let {
		values,
		languages,
		rooms,
		dateRange,
		prayerModule,
		language,
		submitLabel,
		newCourse = false,
		errors = [],
		badDates = [],
		datesBefore = [],
		datesAfter = [],
		untitledDescriptions = []
	}: {
		values: CourseFormValues;
		/** Les langues de l'organisation : celles du texte du cours et de l'enseignement. */
		languages: string[];
		rooms: { id: string; name: string }[];
		/**
		 * Les dates que le serveur accepte, de 1970 à 2100 : les bornes des champs de date, et celles
		 * que le résumé applique (étape 19, lot 2).
		 */
		dateRange: DateRange;
		/** Le module des heures de prière de l'organisation (ADR 0042). */
		prayerModule: boolean;
		/** La langue de l'espace, celle de l'écran. */
		language: Langue;
		submitLabel: string;
		/** Un nouveau cours, et non la fiche d'un cours enregistré. */
		newCourse?: boolean;
		errors?: CourseFormError[];
		badDates?: string[];
		/** Les dates avant le premier jour et après le dernier, qu'aucune séance ne suivrait. */
		datesBefore?: IsoDate[];
		datesAfter?: IsoDate[];
		/** Les langues dont la description est écrite sans titre dans la même langue. */
		untitledDescriptions?: string[];
	} = $props();

	// Une copie, volontairement figée au premier rendu : le formulaire est la source de vérité de
	// la saisie en cours, et le recharger depuis `values` effacerait ce que la personne tape.
	let entry = $state({ ...untrack(() => values) });
	// L'onglet ouvert d'abord est celui de la langue de saisie. Après un envoi refusé pour une
	// description sans titre, c'est celui de la première langue en cause, dans l'ordre de l'encadré :
	// la langue de saisie si son titre manque aussi, sinon la première dont la description n'a pas de
	// titre. Sans cela, le champ à corriger resterait caché derrière son onglet.
	let activeLanguage = $state(
		untrack(() =>
			errors.includes('titleMissing')
				? values.sourceLanguage
				: (untitledDescriptions[0] ?? values.sourceLanguage)
		)
	);
	// Les onglets de langue ne marchent qu'avec JavaScript. Tant que la page n'est pas hydratée, et
	// toujours sans JavaScript, ils n'existent pas, et les champs de chaque langue sont tous montrés.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	const tabs = $derived(hydrated && languages.length > 1);

	// Sur un nouveau cours, la langue de saisie est cochée d'office comme langue d'enseignement (étape
	// 19, lot 2) : le serveur la coche au premier rendu. Avec JavaScript, la case suit la langue de
	// saisie quand la personne en choisit une autre, tant qu'elle n'a pas touché aux cases : elle
	// garde ensuite ce qu'elle a coché. Aucune case cochée reste refusé à l'envoi.
	let teachingFollowsSource = $state(
		untrack(
			() =>
				newCourse &&
				values.teachingLanguages.length === 1 &&
				values.teachingLanguages[0] === values.sourceLanguage
		)
	);
	// Le premier jour d'un cours à dates précises prend la première date tant qu'il est vide, et la
	// suit pendant que la personne écrit ses dates, jusqu'à ce qu'elle le choisisse elle-même (étape
	// 19, lot 2). Sans JavaScript, le serveur le remplit à l'envoi. Après un refus, le jour que le
	// service avait pris revient dans le champ avec sa marque (`startsOnFromDates`) : il suit encore
	// les dates, et ne passe pas pour choisi (relecture du lot 2).
	let startsOnFollowsDates = $state(
		untrack(() => values.startsOn === '' || values.startsOn === values.startsOnFromDates)
	);
	$effect(() => {
		if (entry.recurrenceKind !== 'dates' || !startsOnFollowsDates) return;
		entry.startsOn = firstDate(entry.dates, dateRange) ?? '';
	});

	const text = $derived(courseFormTexts[language]);
	const summary = $derived(summarise(entry, { languages, rooms, dateRange }, language));
	const weekdays = $derived(t(language).weekdays.map((name, index) => [index + 1, name] as const));
	const before = $derived(entry.timingKind === 'beforePrayer');

	const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
	const ORDINALS = [
		[1, 'first'],
		[2, 'second'],
		[3, 'third'],
		[4, 'fourth'],
		[-1, 'last']
	] as const;

	function toggle(list: number[], day: number): number[] {
		return list.includes(day)
			? list.filter((value) => value !== day)
			: [...list, day].sort((a, b) => a - b);
	}

	/**
	 * Les phrases d'une erreur : une seule, sauf pour une description sans titre, qui en a une par
	 * langue en cause, avec le nom de la langue.
	 */
	function messages(error: CourseFormError): string[] {
		if (error === 'descriptionWithoutTitle') {
			return untitledDescriptions.map((code) =>
				text.descriptionWithoutTitle(languageLabel(code, language))
			);
		}
		return [message(error)];
	}

	/** La phrase d'une erreur. Celles des dates recopient les dates en cause, en JJ.MM.AAAA. */
	function message(error: Exclude<CourseFormError, 'descriptionWithoutTitle'>): string {
		const dates = (list: readonly IsoDate[]) => joinList(list.map(numericDate), language);
		if (error === 'badDates') return text.badDates(joinList(badDates, language), badDates.length);
		if (error === 'datesBeforeStart') {
			const earliest = datesBefore[0];
			return text.datesBeforeStart(
				dates(datesBefore),
				datesBefore.length,
				earliest ? numericDate(earliest) : ''
			);
		}
		if (error === 'datesAfterEnd') {
			const latest = datesAfter.at(-1);
			return text.datesAfterEnd(
				dates(datesAfter),
				datesAfter.length,
				latest ? numericDate(latest) : ''
			);
		}
		return text.errors[error];
	}

	function followSource(source: string) {
		if (teachingFollowsSource) entry.teachingLanguages = [source];
	}

	function toggleLanguage(code: string) {
		teachingFollowsSource = false;
		entry.teachingLanguages = entry.teachingLanguages.includes(code)
			? entry.teachingLanguages.filter((value) => value !== code)
			: languages.filter((value) => value === code || entry.teachingLanguages.includes(value));
	}
</script>

<form method="post" class="colonne">
	{#if errors.length > 0}
		<!-- Dans l'ordre des cadres du formulaire, de haut en bas : on corrige en descendant. -->
		<div class="erreurs" role="alert">
			<p>{text.errorsTitle}</p>
			<ul>
				{#each errors as error (error)}
					{#each messages(error) as phrase (phrase)}
						<li>{phrase}</li>
					{/each}
				{/each}
			</ul>
		</div>
	{/if}

	<section id="course-summary" class="resume" aria-labelledby="course-summary-title">
		<h2 id="course-summary-title">{text.summary.title}</h2>
		<dl>
			{#each summary as row (row.key)}
				<div class:manque={row.missing} class:facultatif={row.optional && !row.missing}>
					<dt>{row.label}</dt>
					<dd>
						<!-- Un titre ou une description garde la langue et le sens de son texte. -->
						{#if row.typed}<bdi lang={row.lang} dir={row.lang ? textDirection(row.lang) : 'auto'}
								>{row.value}</bdi
							>{:else}{row.value}{/if}
						<!-- Un champ facultatif le dit, en discret, rempli ou non (étape 19, lot 2). -->
						{#if row.optional}<span class="marque">{text.optional}</span>{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</section>

	<fieldset>
		<legend>{text.textLegend}</legend>
		{#if tabs}
			<div class="onglets" role="tablist" aria-label={text.languageTabs}>
				{#each languages as code (code)}
					<button
						type="button"
						role="tab"
						aria-selected={activeLanguage === code}
						onclick={() => (activeLanguage = code)}
					>
						{languageLabel(code, language)}
						{#if code === entry.sourceLanguage}{text.sourceMark}{/if}
					</button>
				{/each}
			</div>
		{/if}
		{#each languages as code (code)}
			<!-- Les champs des autres langues restent dans la page : sans JavaScript, tout est
			     visible et saisissable d'un coup, et seuls les onglets, une fois la page hydratée, en
			     masquent une partie. Aucun n'est `required` : caché dans un onglet, il bloquerait
			     l'envoi sans rien dire, et le serveur dit déjà ce qui manque. -->
			<div class="onglet" class:masque={tabs && activeLanguage !== code}>
				<label for={`title-${code}`}>
					{text.titleLabel(languageLabel(code, language))}
					<span class="marque">
						{code === entry.sourceLanguage ? text.required : text.optional}
					</span>
				</label>
				<!-- Le texte d'une langue garde son sens d'écriture, quelle que soit celle de l'écran. -->
				<input
					id={`title-${code}`}
					name={`title.${code}`}
					type="text"
					maxlength="120"
					lang={code}
					dir={textDirection(code)}
					bind:value={entry.titles[code]}
					aria-describedby={`title-${code}-hint`}
				/>
				<p class="aide" id={`title-${code}-hint`}>{text.titleHint}</p>
				<label for={`description-${code}`}>
					{text.descriptionLabel(languageLabel(code, language))}
					<span class="marque">{text.optional}</span>
				</label>
				<textarea
					id={`description-${code}`}
					name={`description.${code}`}
					rows="3"
					lang={code}
					dir={textDirection(code)}
					bind:value={entry.descriptions[code]}
					aria-describedby={`description-${code}-hint`}></textarea>
				<p class="aide" id={`description-${code}-hint`}>{text.descriptionHint}</p>
			</div>
		{/each}
		<label for="sourceLanguage">{text.sourceLanguageLabel}</label>
		<select
			id="sourceLanguage"
			name="sourceLanguage"
			bind:value={entry.sourceLanguage}
			onchange={(event) => followSource(event.currentTarget.value)}
			aria-describedby="sourceLanguage-hint"
		>
			{#each languages as code (code)}
				<option value={code}>{languageLabel(code, language)}</option>
			{/each}
		</select>
		<p class="aide" id="sourceLanguage-hint">{text.sourceLanguageHint}</p>
	</fieldset>

	<fieldset>
		<legend>{text.audienceLegend}</legend>
		<label for="audience">{text.audienceLabel}</label>
		<select id="audience" name="audience" bind:value={entry.audience}>
			{#each Object.entries(audienceLabels(language)) as [code, label] (code)}
				<option value={code}>{label}</option>
			{/each}
		</select>
		<fieldset class="cases" aria-describedby="teaching-hint">
			<legend>{text.teachingLegend}</legend>
			{#each languages as code (code)}
				<label class="case">
					<input
						type="checkbox"
						name="teachingLanguages"
						value={code}
						checked={entry.teachingLanguages.includes(code)}
						onchange={() => toggleLanguage(code)}
					/>
					{languageLabel(code, language)}
				</label>
			{/each}
		</fieldset>
		<p class="aide" id="teaching-hint">{text.teachingHint}</p>
	</fieldset>

	<fieldset>
		<legend>{text.rhythmLegend}</legend>
		<label for="recurrenceKind">{text.recurrenceLabel}</label>
		<select id="recurrenceKind" name="recurrenceKind" bind:value={entry.recurrenceKind}>
			<option value="weekly">{text.recurrenceOptions.weekly}</option>
			<option value="monthly">{text.recurrenceOptions.monthly}</option>
			<option value="dates">{text.recurrenceOptions.dates}</option>
		</select>

		{#if entry.recurrenceKind === 'weekly'}
			<fieldset class="cases">
				<legend>{text.weekdaysLegend}</legend>
				{#each weekdays as [day, name] (day)}
					<label class="case">
						<input
							type="checkbox"
							name="weekdays"
							value={day}
							checked={entry.weekdays.includes(day)}
							onchange={() => (entry.weekdays = toggle(entry.weekdays, day))}
						/>
						{name}
					</label>
				{/each}
			</fieldset>
			<label for="interval">{text.intervalLabel}</label>
			<select
				id="interval"
				name="interval"
				bind:value={entry.interval}
				aria-describedby="interval-hint"
			>
				<option value={1}>{text.frequencies.weekly}</option>
				<option value={2}>{text.frequencies.fortnightly}</option>
			</select>
			<p class="aide" id="interval-hint">{text.intervalHint}</p>
		{:else if entry.recurrenceKind === 'monthly'}
			<!-- Le jour d'abord, puis son rang dans le mois : « lundi », puis « le premier ». La règle
			     est le premier lundi du mois, pas la première semaine. -->
			<label for="monthlyWeekday">{text.monthlyWeekdayLabel}</label>
			<select
				id="monthlyWeekday"
				name="monthlyWeekday"
				bind:value={entry.monthlyWeekday}
				aria-describedby="monthly-hint"
			>
				{#each weekdays as [day, name] (day)}
					<option value={day}>{name}</option>
				{/each}
			</select>
			<label for="monthlyOrdinal">{text.ordinalLabel}</label>
			<select
				id="monthlyOrdinal"
				name="monthlyOrdinal"
				bind:value={entry.monthlyOrdinal}
				aria-describedby="monthly-hint"
			>
				{#each ORDINALS as [value, key] (value)}
					<option {value}>{text.ordinals[key]}</option>
				{/each}
			</select>
			<p class="aide" id="monthly-hint">{text.monthlyHint}</p>
		{:else}
			<label for="dates">{text.datesLabel}</label>
			<textarea
				id="dates"
				name="dates"
				rows="4"
				bind:value={entry.dates}
				aria-describedby="dates-hint"></textarea>
			<p class="aide" id="dates-hint">{text.datesHint}</p>
		{/if}
	</fieldset>

	<fieldset>
		<legend>{text.timeLegend}</legend>
		<!-- Sans le module, un cours n'a qu'une façon d'avoir une heure, et le choix disparaît
		     plutôt que de rester grisé : une organisation n'a pas à refuser ce qui ne la concerne
		     pas (ADR 0042). -->
		{#if prayerModule}
			<label for="timingKind">{text.timingLabel}</label>
			<select
				id="timingKind"
				name="timingKind"
				bind:value={entry.timingKind}
				aria-describedby="timingKind-hint"
			>
				{#each TIMING_CHOICES as choice (choice)}
					<option value={choice}>{text.timingOptions[choice]}</option>
				{/each}
			</select>
			<p class="aide" id="timingKind-hint">{text.timingHint}</p>
		{:else}
			<input type="hidden" name="timingKind" value="fixed" />
		{/if}

		<!-- Les champs d'une façon de fixer l'heure ne sont `required` qu'avec JavaScript, comme le
		     premier jour (étape 19, lot 3). Sans JavaScript, changer le choix du dessus ne change pas la
		     page : elle part avec les champs de l'autre façon, et un `required` vide y bloquait l'envoi.
		     Il fallait taper des heures pour voir les champs de la prière, ou des minutes pour revenir
		     à une heure fixe. Le serveur refuse ce qui manque, avec sa phrase. Sans le module, il n'y a
		     pas de choix : l'heure fixe est la seule, et ses heures restent exigées sans JavaScript
		     (relecture du lot 3). -->
		{#if !prayerModule || entry.timingKind === 'fixed'}
			<label for="start">{text.startLabel}</label>
			<input
				id="start"
				type="time"
				name="start"
				bind:value={entry.start}
				required={hydrated || !prayerModule}
				aria-describedby="time-hint"
			/>
			<label for="end">{text.endLabel}</label>
			<input
				id="end"
				type="time"
				name="end"
				bind:value={entry.end}
				required={hydrated || !prayerModule}
				aria-describedby="time-hint"
			/>
			<p class="aide" id="time-hint">{text.timeHint}</p>
		{:else}
			<label for="prayer">{text.prayerLabel}</label>
			<select id="prayer" name="prayer" bind:value={entry.prayer}>
				{#each PRAYERS as prayer (prayer)}
					<option value={prayer}>{prayerLabel(prayer, language)}</option>
				{/each}
			</select>
			<!-- Des minutes toujours positives : le sens est dans le choix du dessus (retour C3). Avec
			     JavaScript, les bornes suivent ce choix : de 1 à 120 avant une prière, de 0 à 240 après.
			     Sans JavaScript, passer d'avant à après ne change pas la page, et les bornes d'avant
			     arrêtaient 0 minute ou plus de 120. Le champ y porte donc les bornes des deux choix
			     réunies, de 0 à 240, et le serveur refuse ce qui sort de celles du choix envoyé, avec sa
			     phrase (relecture du lot 3). -->
			<label for="offsetMinutes">
				{before ? text.minutesBeforeLabel : text.minutesAfterLabel}
			</label>
			<input
				id="offsetMinutes"
				type="number"
				name="offsetMinutes"
				min={hydrated && before ? 1 : 0}
				max={hydrated && before ? -MIN_OFFSET_MINUTES : MAX_OFFSET_MINUTES}
				step="1"
				required={hydrated}
				bind:value={entry.offsetMinutes}
				aria-describedby="offsetMinutes-hint"
			/>
			<p class="aide" id="offsetMinutes-hint">
				{before ? text.minutesBeforeHint : text.minutesAfterHint}
			</p>
			<label for="durationMinutes">{text.durationLabel}</label>
			<input
				id="durationMinutes"
				type="number"
				name="durationMinutes"
				min={MIN_DURATION_MINUTES}
				max={MAX_DURATION_MINUTES}
				step="1"
				required={hydrated}
				bind:value={entry.durationMinutes}
				aria-describedby="durationMinutes-hint"
			/>
			<p class="aide" id="durationMinutes-hint">{text.durationHint}</p>
		{/if}
	</fieldset>

	<fieldset>
		<legend>{text.placeLegend}</legend>
		<label for="roomId">{text.roomLabel} <span class="marque">{text.optional}</span></label>
		<select id="roomId" name="roomId" bind:value={entry.roomId} aria-describedby="roomId-hint">
			<option value="">{text.noRoom}</option>
			{#each rooms as room (room.id)}
				<option value={room.id}>{room.name}</option>
			{/each}
		</select>
		<p class="aide" id="roomId-hint">{text.roomHint}</p>
		<label for="teacher">{text.teacherLabel} <span class="marque">{text.optional}</span></label>
		<input
			id="teacher"
			type="text"
			name="teacher"
			maxlength="120"
			bind:value={entry.teacher}
			aria-describedby="teacher-hint"
		/>
		<p class="aide" id="teacher-hint">{text.teacherHint}</p>
		<label for="startsOn">{text.startsOnLabel} <span class="marque">{text.required}</span></label>
		<!-- Les bornes du serveur : le calendrier ne propose pas une date que l'envoi refuserait.
		     `required` seulement avec JavaScript, et jamais pour un cours à dates précises, dont le
		     premier jour vide prend la première date (étape 19, lot 2). Sans JavaScript, choisir « à
		     des dates précises » ne change pas la page : le premier envoi part d'une page rendue pour
		     un cours chaque semaine, et un `required` y bloquait l'envoi, si bien que le serveur ne
		     voyait jamais arriver le premier jour vide. Le serveur refuse un premier jour vide qu'il ne
		     peut pas remplir, avec sa phrase. -->
		<input
			id="startsOn"
			type="date"
			name="startsOn"
			min={dateRange.first}
			max={dateRange.last}
			bind:value={entry.startsOn}
			oninput={(event) => (startsOnFollowsDates = event.currentTarget.value === '')}
			required={hydrated && entry.recurrenceKind !== 'dates'}
			aria-describedby="startsOn-hint"
		/>
		<!-- Le premier jour tant qu'il suit les dates, vide dès que la personne le choisit. Renvoyé
		     tel quel avec le champ, sans JavaScript aussi, il dit au serveur de le reprendre de la
		     première date ; changé à la main, il ne correspond plus, et le jour est choisi. -->
		<input
			type="hidden"
			name="startsOnFromDates"
			value={startsOnFollowsDates ? entry.startsOn : ''}
		/>
		<p class="aide" id="startsOn-hint">{text.startsOnHint}</p>
		<label for="endsOn">{text.endsOnLabel} <span class="marque">{text.optional}</span></label>
		<input
			id="endsOn"
			type="date"
			name="endsOn"
			min={dateRange.first}
			max={dateRange.last}
			bind:value={entry.endsOn}
			aria-describedby="endsOn-hint"
		/>
		<p class="aide" id="endsOn-hint">{text.endsOnHint}</p>
		<label for="status">{text.statusLabel}</label>
		<select id="status" name="status" bind:value={entry.status} aria-describedby="status-hint">
			<option value="draft">{text.statuses.draft}</option>
			<option value="published">{text.statuses.published}</option>
		</select>
		<p class="aide" id="status-hint">{text.statusHint}</p>
	</fieldset>

	<button type="submit">{submitLabel}</button>
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
	.marque {
		font-weight: 400;
		color: #555;
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
		border-inline-start: 4px solid var(--accent);
		padding: 0.75rem;
	}
	.resume h2 {
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}
	.resume dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.resume div {
		display: flex;
		flex-wrap: wrap;
		column-gap: 0.35rem;
	}
	.resume dt {
		font-weight: 600;
	}
	.resume dd {
		margin: 0;
	}
	/* Ce qui manque se voit sans la couleur : sa phrase le dit, et le trait le souligne. */
	.resume .manque dd {
		color: #92400e;
		font-weight: 600;
		text-decoration: underline dotted;
	}
	.erreurs {
		color: #b91c1c;
		font-weight: 600;
		border: 1px solid #b91c1c;
		border-radius: 0.5rem;
		padding: 0.75rem;
	}
	.erreurs p {
		margin: 0;
	}
	.erreurs ul {
		margin: 0.35rem 0 0;
		padding-inline-start: 1.25rem;
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
