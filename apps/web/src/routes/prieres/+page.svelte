<script lang="ts">
	// Les heures de prière (étape 18, retours C1 et C2). Le réglage commence par une seule question,
	// « D'où viennent vos heures de prière ? », et chaque réponse n'affiche que ce qu'elle demande,
	// puis l'aperçu des sept prochains jours, puis « Enregistrer ». En bas, ce que voit le public.
	//
	// Tout marche sans JavaScript : la question est un formulaire qui recharge l'écran avec la réponse
	// choisie, la recherche d'une localité un formulaire qui rend la liste. Avec JavaScript, la
	// réponse s'affiche dès qu'on la coche, et la liste des localités suit la frappe.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { IsoDate } from '@jadwal/core';
	import { longDate, numericDate } from '$lib/i18n.js';
	import { prayersTexts } from '$lib/i18n/prayers.js';
	import { nomPriere } from '$lib/public/affichage.js';
	import type { RaisonLue } from '$lib/server/prieres.js';
	import { localityKey, localityOptions } from './locality-options.js';

	let { data, form } = $props();
	const text = $derived(prayersTexts[data.language]);

	const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
	const REPONSES = ['computed', 'import', 'manual'] as const;
	type Reponse = (typeof REPONSES)[number];
	type Jour = (typeof data.septJours)[number];
	type Periode = (typeof data.periodes)[number];

	/** Les noms de colonnes que le lecteur de fichiers reconnaît, pour le format en détail. */
	const COLONNES: [string, string[]][] = [
		['date', ['date', 'jour', 'day', 'tag']],
		['fajr', ['fajr', 'fadjr', 'fadjer', 'sobh', 'subh', 'imsak']],
		['dhuhr', ['dhuhr', 'duhr', 'zuhr', 'dohr', 'dhohr', 'midi']],
		['asr', ['asr', 'assr', 'aser']],
		['maghrib', ['maghrib', 'maghreb', 'magrib', 'coucher']],
		['isha', ['isha', 'icha', 'ishaa', 'ichaa', 'isya']]
	];

	const prayer = (code: string) => nomPriere(data.language, code);

	/** « 2502 Biel/Bienne (BE) » : une localité telle qu'on la reconnaît en Suisse. */
	function label(localite: { postcode: string; name: string; canton: string }): string {
		return `${localite.postcode} ${localite.name} (${localite.canton})`;
	}

	const coordonnee = (valeur: number) => valeur.toFixed(4);
	const heure = (valeur: string | null | undefined) => String(valeur ?? '').slice(0, 5);
	const jourDe = (date: string) => date.slice(0, 10) as IsoDate;

	/** Vrai une fois l'écran repris par JavaScript : le bouton « Continuer » n'a plus lieu d'être. */
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	/**
	 * La réponse montrée : celle du formulaire qu'on vient d'envoyer, sinon celle de l'adresse ou des
	 * sept prochains jours ; puis celle qu'on coche, sans recharger. Une période enregistrée alors
	 * qu'aucune réponse n'était choisie montre la saisie à la main, où elle se voit.
	 */
	let choix = $derived<Reponse | null>(
		form?.answer ??
			data.answer ??
			(form?.periode || form?.periodeEnregistree || form?.periodeDupliquee || form?.periodeSupprimee
				? 'manual'
				: null)
	);

	// La localité : ce qui a été tapé, les localités trouvées, et celle qui a été choisie. Avant tout
	// envoi du formulaire, c'est la localité enregistrée : sa case est cochée dès le chargement, et le
	// formulaire la renvoie. Sans cela, il n'envoyait que les deux nombres de « Hors de Suisse », et
	// l'écran qui revenait ouvrait ce repli sans plus nommer la localité.
	const saisie = $derived(form?.saisie ?? null);
	let recherche = $derived(data.search?.query ?? '');
	let trouvees = $derived(data.search?.results ?? null);
	let choisie = $derived(saisie ? saisie.locality : data.savedLocality);
	/** Vrai quand la localité choisie est celle qui est enregistrée : l'écran le dit ainsi. */
	const choisieEnregistree = $derived(
		choisie !== null &&
			data.savedLocality !== null &&
			localityKey(choisie) === localityKey(data.savedLocality)
	);
	let latitude = $derived(
		saisie ? saisie.latitude : data.reglages.latitude === null ? '' : String(data.reglages.latitude)
	);
	let longitude = $derived(
		saisie
			? saisie.longitude
			: data.reglages.longitude === null
				? ''
				: String(data.reglages.longitude)
	);
	/** Les cases de la liste : voir `localityOptions`, qui garde cochée la localité choisie. */
	const options = $derived(localityOptions(trouvees, choisie));
	const message = $derived.by(() => {
		if (trouvees === null) return '';
		if (recherche.trim().length < 2) return text.computed.tooShort;
		if (trouvees.length === 0) return text.computed.noneFound;
		// Une liste pleine en a peut-être laissé : elle montre les meilleures, elle ne les compte pas.
		if (trouvees.length >= data.localities.limit) {
			return text.computed.foundBest(trouvees.length);
		}
		return text.computed.found(trouvees.length);
	});

	/** Choisir une localité remplit sa position, que l'écran montre. */
	function choisir(localite: NonNullable<typeof choisie>) {
		choisie = localite;
		latitude = String(localite.latitude);
		longitude = String(localite.longitude);
	}

	let minuterie: ReturnType<typeof setTimeout> | undefined;
	let demande = 0;

	/** La recherche suit la frappe, un cinquième de seconde après la dernière lettre. */
	function chercherBientot() {
		clearTimeout(minuterie);
		minuterie = setTimeout(chercher, 200);
	}

	async function chercher() {
		clearTimeout(minuterie);
		const texte = recherche.trim();
		const numero = (demande += 1);
		if (texte === '') {
			trouvees = null;
			return;
		}
		if (texte.length < 2) {
			trouvees = [];
			return;
		}
		try {
			const reponse = await fetch(
				`${resolve('/prieres/localites')}?q=${encodeURIComponent(texte)}`,
				{ headers: { accept: 'application/json' } }
			);
			// Une réponse arrivée après une frappe plus récente ne remplace pas la sienne.
			if (!reponse.ok || numero !== demande) return;
			trouvees = await reponse.json();
		} catch {
			// Sans réponse, le bouton « Chercher » recharge l'écran avec la liste : rien n'est perdu.
		}
	}

	// Les réglages du calcul : ceux que le formulaire vient d'envoyer, sinon ceux qui sont enregistrés.
	const reglage = $derived({
		method: saisie?.method || data.reglages.method || 'MuslimWorldLeague',
		madhab: saisie?.madhab || data.reglages.madhab,
		rule: saisie?.highLatitudeRule || data.reglages.high_latitude_rule,
		adjustments: saisie?.adjustments ?? {
			fajr: data.reglages.fajr_adjustment,
			dhuhr: data.reglages.dhuhr_adjustment,
			asr: data.reglages.asr_adjustment,
			maghrib: data.reglages.maghrib_adjustment,
			isha: data.reglages.isha_adjustment
		}
	});
	/** « Hors de Suisse » s'ouvre quand la position ne vient pas de la liste. */
	const horsDeSuisse = $derived(
		saisie
			? saisie.locality === null && saisie.latitude !== ''
			: data.reglages.latitude !== null && data.savedLocality === null
	);
	/** Les réglages avancés s'ouvrent quand l'un d'eux n'a plus sa valeur proposée. */
	const avances = $derived(
		reglage.method !== 'MuslimWorldLeague' ||
			reglage.madhab !== 'shafi' ||
			(data.recommandee !== null && reglage.rule !== data.recommandee) ||
			PRIERES.some((priere) => reglage.adjustments[priere] !== 0)
	);
	/** L'aperçu du calcul : celui du formulaire s'il vient d'être demandé, sinon celui des réglages. */
	const apercu = $derived(form?.apercuCalcule ?? data.apercu);
	const lecture = $derived(form?.lecture);
	/** « 512 Ko » plutôt que « 512K », la forme qu'adapter-node lit dans `BODY_SIZE_LIMIT`. */
	const taille = $derived.by(() => {
		const trouve = /^(\d+)\s*([KMG])$/i.exec(data.tailleMaximale.trim());
		if (!trouve) return data.tailleMaximale;
		const unite = (trouve[2] ?? 'K').toUpperCase() as 'K' | 'M' | 'G';
		return `${trouve[1]} ${text.file.units[unite]}`;
	});

	/** Les périodes qui donnent au moins une heure affichée : elles passent avant tout le reste. */
	const periodesSaisies = $derived(
		data.periodes.filter((periode) => PRIERES.some((priere) => periode.soleil[priere] !== null))
			.length
	);
	/** La dernière période : une période nouvelle part de ses valeurs. */
	const derniere = $derived(data.periodes.at(-1) ?? null);
	/** Le formulaire de période qu'une réponse du serveur (erreur, aperçu) doit rouvrir. */
	const periodeOuverte = $derived(form?.periode ? (form.periode.id ?? 'nouvelle') : null);

	const erreur = $derived.by(() => {
		const code = form?.error;
		if (!code) return null;
		if (code === 'fileTooLarge') return text.errors.fileTooLarge(taille);
		if (code === 'iqamaBoth') return text.errors.iqamaBoth(prayer(form?.prayer ?? ''));
		return text.errors[code];
	});

	/** Une raison du lecteur de fichiers, dans la langue de l'écran, dates en JJ.MM.AAAA. */
	function raison(lue: RaisonLue): string {
		const phrases = text.reasons;
		switch (lue.code) {
			case 'empty':
				return phrases.empty;
			case 'header':
				return phrases.header;
			case 'badDate':
				return phrases.badDate(lue.raw);
			case 'badTime':
				return phrases.badTime(prayer(lue.prayer), lue.raw);
			case 'noSuchDate':
				return phrases.noSuchDate;
			case 'order':
				return phrases.order(
					prayer(lue.later),
					lue.laterTime,
					prayer(lue.earlier),
					lue.earlierTime
				);
			case 'ishaBeforeMaghrib':
				return phrases.ishaBeforeMaghrib(prayer('isha'), lue.isha, prayer('maghrib'), lue.maghrib);
			case 'duplicate':
				return phrases.duplicate(numericDate(lue.date as IsoDate));
			case 'jump':
				return phrases.jump(
					numericDate(lue.date as IsoDate),
					prayer(lue.prayer),
					lue.minutes,
					lue.before,
					lue.after
				);
			case 'other':
				return lue.text;
		}
	}

	/** Vrai un vendredi, quand des sessions existent : ce sont elles qui tiennent lieu de Dhuhr. */
	function jumuaCeJourLa(date: string): boolean {
		if (data.vendredi.length === 0) return false;
		// Le jour de semaine sans objet `Date` : `1970-01-01` était un jeudi.
		const jours = Math.round(
			(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse('1970-01-01T00:00:00Z')) / 86400000
		);
		return ((jours + 3) % 7) + 1 === 5;
	}
</script>

<svelte:head><title>{text.title} | {data.organisation.name}</title></svelte:head>

<h1>{text.title}</h1>
<p class="intro">{text.intro}</p>

{#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
{#if form?.enregistre}
	<p class="succes" role="status">{text.done.settingsSaved(form.ecrites)}</p>
{/if}
{#if form?.importe}
	<p class="succes" role="status">
		{text.done.imported(
			form.importe,
			numericDate(form.premiere as IsoDate),
			numericDate(form.derniere as IsoDate)
		)}
	</p>
{/if}
{#if form?.efface !== undefined}
	<p class="succes" role="status">{text.done.removed(form.efface)}</p>
{/if}
{#if form?.periodeEnregistree}<p class="succes" role="status">{text.done.periodSaved}</p>{/if}
{#if form?.periodeDupliquee}<p class="succes" role="status">{text.done.periodCopied}</p>{/if}
{#if form?.periodeSupprimee}<p class="succes" role="status">{text.done.periodDeleted}</p>{/if}

<section aria-labelledby="etat-titre">
	<h2 id="etat-titre">{text.status.title}</h2>
	{#if data.etat.finDeLImport}
		<p>
			{text.status.importUntil(numericDate(data.etat.finDeLImport))}
			{data.etat.calculPossible ? text.status.thenComputed : text.status.thenNothing}
		</p>
		{#if data.etat.alerte}
			<p class="avertissement">{text.status.importEnding(data.etat.joursRestants ?? 0)}</p>
		{/if}
	{:else if data.etat.calculPossible}
		{#if data.savedLocality}
			<p>{text.status.computedFor} <strong><bdi>{label(data.savedLocality)}</bdi></strong></p>
		{:else}
			<p>{text.status.computedForPosition}</p>
		{/if}
	{:else if periodesSaisies === 0}
		<p class="avertissement">{text.status.nothing}</p>
	{/if}
	{#if periodesSaisies > 0}<p>{text.status.manualPeriods(periodesSaisies)}</p>{/if}
</section>

<!-- La question. Sans JavaScript, « Continuer » recharge l'écran avec la réponse cochée ; avec lui,
     la réponse s'affiche dès qu'on la coche, et le bouton disparaît. -->
<form method="get" class="question">
	<fieldset>
		<legend>{text.question.legend}</legend>
		{#each REPONSES as reponse (reponse)}
			<label class="reponse">
				<input
					type="radio"
					name="source"
					value={reponse}
					checked={choix === reponse}
					onchange={() => (choix = reponse)}
				/>
				<span>
					<strong>{text.question.answers[reponse].label}</strong>
					<span class="aide">{text.question.answers[reponse].hint}</span>
				</span>
			</label>
		{/each}
	</fieldset>
	<p class="aide">{text.question.priority}</p>
	{#if !hydrated}<button type="submit">{text.question.continue}</button>{/if}
</form>

{#if choix === 'computed'}
	<section aria-labelledby="calcul-titre" class="reponse-choisie">
		<h2 id="calcul-titre">{text.computed.title}</h2>

		<!-- La recherche sans JavaScript : un formulaire vide ici, que le champ et le bouton de la
		     localité rejoignent par leur attribut `form`. Deux formulaires ne s'imbriquent pas. -->
		<form
			id="recherche-localite"
			method="get"
			onsubmit={(event) => {
				event.preventDefault();
				chercher();
			}}
		>
			<input type="hidden" name="source" value="computed" />
		</form>

		<form method="post" action="?source=computed&/enregistrer" class="colonne">
			<fieldset>
				<legend>{text.computed.localityLegend}</legend>
				{#if data.savedLocality && !choisie}
					<p>
						{text.computed.saved}
						<strong><bdi>{label(data.savedLocality)}</bdi></strong>
						<br />
						{text.computed.position(
							coordonnee(data.savedLocality.latitude),
							coordonnee(data.savedLocality.longitude)
						)}
					</p>
				{/if}
				<label for="lieu">{text.computed.searchLabel}</label>
				<p class="aide" id="lieu-aide">{text.computed.searchHint}</p>
				{#if text.computed.latinLetters}
					<p class="aide" id="lieu-latin">{text.computed.latinLetters}</p>
				{/if}
				<div class="ligne">
					<input
						id="lieu"
						name="lieu"
						type="search"
						form="recherche-localite"
						value={recherche}
						autocomplete="off"
						aria-describedby={text.computed.latinLetters ? 'lieu-aide lieu-latin' : 'lieu-aide'}
						oninput={(event) => {
							recherche = event.currentTarget.value;
							chercherBientot();
						}}
					/>
					<button type="submit" form="recherche-localite">{text.computed.searchButton}</button>
				</div>
				<p class="aide" aria-live="polite">{message}</p>
				{#if options.length > 0}
					<fieldset class="resultats">
						<legend>{text.computed.resultsLegend}</legend>
						{#each options as localite (localityKey(localite))}
							<label class="resultat">
								<input
									type="radio"
									name="localite"
									value={localityKey(localite)}
									checked={choisie !== null && localityKey(choisie) === localityKey(localite)}
									onchange={() => choisir(localite)}
								/>
								<bdi>{label(localite)}</bdi>
							</label>
						{/each}
					</fieldset>
				{/if}
				{#if choisie}
					<p class="choisie">
						{choisieEnregistree ? text.computed.saved : text.computed.chosen}
						<strong><bdi>{label(choisie)}</bdi></strong>
						<br />
						{text.computed.position(coordonnee(choisie.latitude), coordonnee(choisie.longitude))}
					</p>
				{/if}
				<!-- Le nom de la source dans un `<bdi>` : « ©swisstopo » garde son signe à gauche du
				     nom au milieu d'une phrase arabe, qui se lit de droite à gauche. -->
				<p class="aide credit">
					{text.computed.creditBefore}<bdi>{data.localities.credit[data.language]}</bdi
					>{text.computed.creditAfter(numericDate(data.localities.version))}
				</p>
			</fieldset>

			<details class="repli" open={horsDeSuisse}>
				<summary>{text.computed.abroadSummary}</summary>
				<p class="aide">{text.computed.abroadHint}</p>
				<div class="position">
					<div>
						<label for="latitude">{text.computed.latitude}</label>
						<input
							id="latitude"
							name="latitude"
							type="text"
							inputmode="decimal"
							value={latitude}
							placeholder="47.1368"
							oninput={(event) => {
								latitude = event.currentTarget.value;
								choisie = null;
							}}
						/>
					</div>
					<div>
						<label for="longitude">{text.computed.longitude}</label>
						<input
							id="longitude"
							name="longitude"
							type="text"
							inputmode="decimal"
							value={longitude}
							placeholder="7.2468"
							oninput={(event) => {
								longitude = event.currentTarget.value;
								choisie = null;
							}}
						/>
					</div>
				</div>
				<p class="aide">{text.computed.abroadExample}</p>
			</details>

			<details class="repli" open={avances}>
				<summary>{text.computed.advancedSummary}</summary>
				<p class="aide">{text.computed.advancedHint}</p>
				<div class="colonne">
					<label for="method">{text.computed.methodLabel}</label>
					<select id="method" name="method" aria-describedby="method-aide">
						{#each data.methodes as methode (methode)}
							<option value={methode} selected={methode === reglage.method}>
								{text.computed.methods[methode]}
							</option>
						{/each}
					</select>
					<p class="aide" id="method-aide">{text.computed.methodHint}</p>

					<label for="madhab">{text.computed.madhabLabel}</label>
					<select id="madhab" name="madhab" aria-describedby="madhab-aide">
						{#each data.ecoles as ecole (ecole)}
							<option value={ecole} selected={ecole === reglage.madhab}>
								{text.computed.madhabs[ecole]}
							</option>
						{/each}
					</select>
					<p class="aide" id="madhab-aide">{text.computed.madhabHint}</p>

					<label for="highLatitudeRule">{text.computed.ruleLabel}</label>
					<select id="highLatitudeRule" name="highLatitudeRule" aria-describedby="regle-aide">
						{#each data.regles as regle (regle)}
							<option value={regle} selected={regle === reglage.rule}>
								{text.computed.rules[regle]}
							</option>
						{/each}
					</select>
					<p class="aide" id="regle-aide">
						{text.computed.ruleHint}
						{#if data.recommandee}
							{text.computed.ruleUsual(text.computed.rules[data.recommandee])}
						{/if}
					</p>

					<fieldset>
						<legend>{text.computed.adjustmentsLegend}</legend>
						<div class="decalages">
							{#each PRIERES as priere (priere)}
								<label for={`${priere}Adjustment`}>{prayer(priere)}</label>
								<input
									id={`${priere}Adjustment`}
									name={`${priere}Adjustment`}
									type="number"
									min="-120"
									max="120"
									value={reglage.adjustments[priere]}
								/>
							{/each}
						</div>
						<p class="aide">{text.computed.adjustmentsHint}</p>
					</fieldset>
				</div>
			</details>

			<div class="boutons">
				<button type="submit" formaction="?source=computed&/apercu">
					{text.computed.previewButton}
				</button>
			</div>

			<h3 id="apercu-calcul-titre">{text.computed.previewTitle}</h3>
			{#if apercu.length === 0}
				<p class="aide">{text.computed.previewEmpty}</p>
			{:else}
				<p class="aide">
					{form?.apercuCalcule ? text.computed.previewUnsaved : text.computed.previewSaved}
				</p>
				<!-- Chaque tableau qui défile est une région nommée qui prend le focus : sans cela, le
				     clavier ne le fait pas défiler (axe, scrollable-region-focusable). Svelte ne connaît
				     pas ce cas, d'où la consigne qui suit, posée sur chacun. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div class="defile" role="region" tabindex="0" aria-labelledby="apercu-calcul-titre">
					<table>
						<thead>
							<tr>
								<th scope="col">{text.table.day}</th>
								{#each PRIERES as priere (priere)}
									<th scope="col">{prayer(priere)}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each apercu as jour (jour.date)}
								<tr>
									<th scope="row">{longDate(data.language, jourDe(jour.date))}</th>
									{#each PRIERES as priere (priere)}
										<td>
											{jour[priere]}
											{#if priere === 'isha' && jour.apresMinuit}
												<span class="marque" title={text.computed.nextDayTitle}>
													{text.computed.nextDay}
												</span>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<div class="boutons">
				<button type="submit" class="principal">{text.computed.save}</button>
			</div>
		</form>
	</section>
{:else if choix === 'import'}
	<section aria-labelledby="fichier-titre" class="reponse-choisie">
		<h2 id="fichier-titre">{text.file.title}</h2>
		<p class="aide">{text.file.intro(taille)}</p>

		<!-- Un exemple vaut mieux qu'une description : un fichier se lit comme ce tableau. -->
		<p class="aide" id="exemple-titre"><strong>{text.file.exampleTitle}</strong></p>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="defile" role="region" tabindex="0" aria-labelledby="exemple-titre">
			<table class="exemple">
				<thead>
					<tr>
						{#each COLONNES as [colonne] (colonne)}
							<th scope="col"><code>{colonne}</code></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>21.09.2026</td>
						<td>05:42</td>
						<td>13:22</td>
						<td>16:48</td>
						<td>19:23</td>
						<td>20:51</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Le format en entier, replié : la personne qui envoie l'export de sa fédération en a besoin,
		     celle qui a déjà le bon fichier n'a pas à le lire. `details` n'a besoin d'aucun script. -->
		<details class="repli">
			<summary>{text.file.formatSummary}</summary>
			<p class="aide">{text.file.formatColumns}</p>
			<ul class="aide">
				{#each COLONNES as [colonne, noms] (colonne)}
					<li>
						<strong>
							{text.file.columnNames(colonne === 'date' ? text.file.columnDate : prayer(colonne))}
						</strong>
						{#each noms as nom, rang (nom)}
							{#if rang > 0}{text.file.listSeparator}{/if}<code>{nom}</code>
						{/each}
					</li>
				{/each}
			</ul>
			<p class="aide">{text.file.formatDates}</p>
			<p class="aide">{text.file.formatTimes}</p>
			<p class="aide">{text.file.formatLocal}</p>
			<p class="aide">{text.file.formatEncoding}</p>
		</details>

		<p class="aide">
			<a href={resolve('/prieres/modele.csv')} download>{text.file.template}</a>
			{text.file.templateHint}
		</p>

		<form
			method="post"
			action="?source=import&/lireFichier"
			enctype="multipart/form-data"
			class="colonne"
		>
			<label for="calendrier">{text.file.fileLabel}</label>
			<p class="aide" id="calendrier-aide">{text.file.fileHint}</p>
			<input
				id="calendrier"
				name="calendrier"
				type="file"
				accept=".csv,text/csv,text/plain"
				aria-describedby="calendrier-aide"
				required
			/>

			<label for="ordre">{text.file.orderLabel}</label>
			<select id="ordre" name="ordre" aria-describedby="ordre-aide">
				<option value="auto">{text.file.orders.auto}</option>
				<option value="jour-mois">{text.file.orders.dayMonth}</option>
				<option value="mois-jour">{text.file.orders.monthDay}</option>
			</select>
			<p class="aide" id="ordre-aide">{text.file.orderHint}</p>

			<div class="position">
				<div>
					<label for="annee">{text.file.yearLabel}</label>
					<input id="annee" name="annee" type="number" min="2020" max="2100" placeholder="2026" />
				</div>
				<div>
					<label for="mois">{text.file.monthLabel}</label>
					<input id="mois" name="mois" type="number" min="1" max="12" placeholder="9" />
				</div>
			</div>
			<p class="aide">{text.file.yearMonthHint}</p>

			<div class="boutons"><button type="submit">{text.file.read}</button></div>
		</form>

		{#if lecture}
			<div class="rapport">
				<h3>{text.file.readTitle} <bdi>{lecture.nom}</bdi></h3>
				<ul>
					<li>
						{text.file.encoding(
							lecture.encodage,
							lecture.separateur === '\t' ? text.file.tab : lecture.separateur
						)}
					</li>
					<li>
						<strong>
							{lecture.premiere && lecture.derniere
								? text.file.days(
										lecture.jours,
										numericDate(lecture.premiere),
										numericDate(lecture.derniere)
									)
								: text.file.daysNone}
						</strong>
					</li>
					{#if lecture.nombreDeManquants > 0}
						<li>
							{text.file.missing(
								lecture.nombreDeManquants,
								lecture.manquants.map((date) => numericDate(date)).join(text.file.listSeparator) +
									(lecture.nombreDeManquants > lecture.manquants.length ? '…' : '')
							)}
						</li>
					{/if}
					{#if lecture.nombreDeRefusees > 0}
						<li>{text.file.refused(lecture.nombreDeRefusees)}</li>
					{/if}
				</ul>

				{#if lecture.ordreAmbigu}
					<p class="avertissement" role="alert">{text.file.ambiguous}</p>
				{/if}

				{#if lecture.refusees.length > 0}
					<h4>{text.file.refusedTitle}</h4>
					<ul class="refusees">
						{#each lecture.refusees as refusee, index (index)}
							<li>{text.file.line(refusee.ligne, raison(refusee.raison))}</li>
						{/each}
					</ul>
					{#if lecture.nombreDeRefusees > lecture.refusees.length}
						<p class="aide">{text.file.more(lecture.nombreDeRefusees - lecture.refusees.length)}</p>
					{/if}
				{/if}

				{#if lecture.avertissements.length > 0}
					<h4>{text.file.checkTitle}</h4>
					<ul class="refusees">
						{#each lecture.avertissements as avertissement, index (index)}
							<li>{raison(avertissement)}</li>
						{/each}
					</ul>
					{#if lecture.nombreDAvertissements > lecture.avertissements.length}
						<p class="aide">
							{text.file.more(lecture.nombreDAvertissements - lecture.avertissements.length)}
						</p>
					{/if}
					<p class="aide">{text.file.checkHint}</p>
				{/if}

				{#if lecture.extrait.length > 0}
					<h4 id="extrait-titre">
						{lecture.extraitAVenir ? text.file.previewFromToday : text.file.previewFirst}
					</h4>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div class="defile" role="region" tabindex="0" aria-labelledby="extrait-titre">
						<table>
							<thead>
								<tr>
									<th scope="col">{text.table.day}</th>
									{#each PRIERES as priere (priere)}
										<th scope="col">{prayer(priere)}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each lecture.extrait as jour (jour.date)}
									<tr>
										<th scope="row">{longDate(data.language, jourDe(jour.date))}</th>
										{#each PRIERES as priere (priere)}
											<td>{jour[priere]}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if lecture.jours > 0}
					<form method="post" action="?source=import&/confirmer">
						<input type="hidden" name="aConfirmer" value={lecture.aConfirmer} />
						<p class="aide">{text.file.nothingSaved}</p>
						<button type="submit" class="principal">{text.file.saveDays(lecture.jours)}</button>
					</form>
				{/if}
			</div>
		{/if}

		{#if data.etat.finDeLImport}
			<h3>{text.file.removeTitle}</h3>
			<p class="aide">{text.file.removeHint}</p>
			<form method="post" action="?source=import&/effacer" class="colonne">
				<div class="position">
					<div>
						<label for="de">{text.file.removeFrom}</label>
						<input id="de" name="de" type="date" required />
					</div>
					<div>
						<label for="a">{text.file.removeTo}</label>
						<input id="a" name="a" type="date" required />
					</div>
				</div>
				<div class="boutons"><button type="submit">{text.file.removeButton}</button></div>
			</form>
		{/if}
	</section>
{/if}

{#if choix === 'manual'}
	<section aria-labelledby="main-titre" class="reponse-choisie">
		<h2 id="main-titre">{text.periods.manualTitle}</h2>
		<p class="aide">{text.periods.manualIntro}</p>
		{@render periodes('shown')}
	</section>
{:else if choix !== null}
	<!-- L'iqama vaut pour toutes les sources : elle se règle dans une période, que la réponse soit le
	     calcul ou le fichier, et les heures affichées y restent repliées. -->
	<section aria-labelledby="iqama-titre">
		<h2 id="iqama-titre">{text.periods.iqamaTitle}</h2>
		<p class="aide">{text.periods.iqamaIntro}</p>
		{@render periodes('iqama')}
	</section>
{/if}

<section aria-labelledby="servies-titre">
	<h2 id="servies-titre">{text.served.title}</h2>
	<p class="aide">{text.served.intro}</p>
	{@render tableServie(data.septJours, { etiquette: text.served.tableLabel }, text.served.empty)}
</section>

<!-- Un tableau plus large qu'un téléphone défile seul, et le clavier doit pouvoir le faire défiler :
     il y faut une région nommée qui prend le focus (axe, scrollable-region-focusable). `nom` :
     l'identifiant du titre qui la nomme (`titre`), ou son nom même (`etiquette`) quand ce titre
     nomme déjà la section qui l'entoure, puisque deux régions de même nom, l'une dans l'autre, ne
     se distinguent plus (axe, landmark-unique). `vide` : ce que dit l'écran quand aucun de ces
     jours n'a d'heure. -->
{#snippet tableServie(jours: Jour[], nom: { titre: string } | { etiquette: string }, vide: string)}
	{@const rangs = jours.filter((jour) => PRIERES.some((priere) => jour[priere] !== null))}
	{#if rangs.length === 0}
		<p class="aide">{vide}</p>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="defile"
			role="region"
			tabindex="0"
			aria-labelledby={'titre' in nom ? nom.titre : undefined}
			aria-label={'etiquette' in nom ? nom.etiquette : undefined}
		>
			<table>
				<thead>
					<tr>
						<th scope="col">{text.table.day}</th>
						{#each PRIERES as priere (priere)}
							<th scope="col">{prayer(priere)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rangs as jour (jour.date)}
						<tr>
							<th scope="row">{longDate(data.language, jourDe(jour.date))}</th>
							{#each PRIERES as priere (priere)}
								{@const source = jour[`${priere}_source`]}
								{@const iqama = jour[`${priere}_iqama`]}
								<td>
									{#if jour[priere]}
										<span class="soleil">{heure(jour[priere])}</span>
										{#if source === 'manual' || source === 'import' || source === 'computed'}
											<span class="provenance">{text.table.sources[source]}</span>
										{/if}
										{#if priere === 'dhuhr' && jumuaCeJourLa(jour.date)}
											<!-- Le vendredi, les sessions remplacent le Dhuhr : afficher son iqama
											     ici ferait exactement la contradiction qu'on veut supprimer. -->
											<span class="iqama">
												{text.table.jumua(data.vendredi.map((session) => session.start).join(', '))}
											</span>
										{:else if iqama}
											<span class="iqama">{text.table.iqama(heure(iqama))}</span>
										{/if}
									{:else}
										<span class="aide">–</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/snippet}

{#snippet periodes(mode: 'shown' | 'iqama')}
	<p class="aide">
		{text.periods.noOverlap}
		{text.periods.fridayBefore}<a href={resolve('/vendredi')}>{text.periods.fridayLink}</a>{text
			.periods.fridayAfter}
	</p>

	<!-- « Copier pour l'année suivante » reporte les mêmes dates un an plus tard, parce que les heures
	     de prière suivent le soleil. Une période de Ramadan, elle, suit le calendrier hégirien et
	     recule d'environ onze jours dans l'année civile : la copie est un point de départ, pas une
	     réponse. C'est le seul endroit du service où un malentendu ferait afficher de mauvaises
	     heures pendant un mois entier. -->
	<p class="ramadan">
		<strong>{text.periods.ramadanTitle}</strong>
		{text.periods.ramadanText}
	</p>

	{#each data.periodes as periode (periode.id)}
		<div class="periode">
			<h3>
				<bdi id={`periode-nom-${periode.id}`}>{periode.name}</bdi>
				{#if periode.needsReview}
					<span class="marque" title={text.periods.toReviewTitle}>{text.periods.toReview}</span>
				{/if}
			</h3>
			<p class="aide">
				{periode.toDate
					? text.periods.dates(
							numericDate(periode.fromDate as IsoDate),
							numericDate(periode.toDate as IsoDate)
						)
					: text.periods.datesOpen(numericDate(periode.fromDate as IsoDate))}
			</p>
			{#if periode.needsReview}
				<p class="avertissement">{text.periods.toReviewText}</p>
			{/if}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="defile" role="region" tabindex="0" aria-labelledby={`periode-nom-${periode.id}`}>
				<table>
					<thead>
						<tr>
							<th scope="col">{text.periods.colPrayer}</th>
							<th scope="col">{text.periods.colShown}</th>
							<th scope="col">{text.periods.colIqama}</th>
						</tr>
					</thead>
					<tbody>
						{#each PRIERES as priere (priere)}
							<tr>
								<th scope="row">{prayer(priere)}</th>
								<td>{periode.soleil[priere] ?? '–'}</td>
								<td>
									{#if periode.iqama[priere].heure}
										{periode.iqama[priere].heure}
									{:else if periode.iqama[priere].decalage !== null}
										{text.periods.iqamaAfter(periode.iqama[priere].decalage ?? 0)}
									{:else}
										–
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="boutons">
				<form method="post" action={`?source=${choix}&/dupliquerPeriode`}>
					<input type="hidden" name="periodeId" value={periode.id} />
					<button type="submit">{text.periods.copy}</button>
				</form>
				<form method="post" action={`?source=${choix}&/supprimerPeriode`}>
					<input type="hidden" name="periodeId" value={periode.id} />
					<button type="submit">{text.periods.delete}</button>
				</form>
			</div>
			<details class="repli" open={periodeOuverte === periode.id}>
				<summary>{text.periods.modify}</summary>
				{@render formulairePeriode(periode, mode)}
			</details>
		</div>
	{/each}

	<details
		class="repli periode"
		open={periodeOuverte === 'nouvelle' || (mode === 'shown' && data.periodes.length === 0)}
	>
		<summary>{text.periods.add}</summary>
		{#if derniere}
			<p class="aide">{text.periods.prefilled(derniere.name)}</p>
		{/if}
		{@render formulairePeriode(null, mode)}
	</details>
{/snippet}

{#snippet formulairePeriode(periode: Periode | null, mode: 'shown' | 'iqama')}
	{@const cleDeLaPeriode = periode?.id ?? 'nouvelle'}
	{@const renvoyee = periodeOuverte === cleDeLaPeriode ? (form?.periode ?? null) : null}
	{@const modele = renvoyee ?? periode ?? derniere}
	<form method="post" action={`?source=${choix}&/periode`} class="colonne">
		{#if periode}<input type="hidden" name="periodeId" value={periode.id} />{/if}

		<label for={`nom-${cleDeLaPeriode}`}>{text.periods.nameLabel}</label>
		<p class="aide" id={`nom-aide-${cleDeLaPeriode}`}>{text.periods.nameHint}</p>
		<input
			id={`nom-${cleDeLaPeriode}`}
			name="name"
			type="text"
			maxlength="60"
			value={renvoyee?.name ?? periode?.name ?? ''}
			placeholder={text.periods.namePlaceholder}
			aria-describedby={`nom-aide-${cleDeLaPeriode}`}
			required
		/>

		<div class="position">
			<div>
				<label for={`de-${cleDeLaPeriode}`}>{text.periods.fromLabel}</label>
				<input
					id={`de-${cleDeLaPeriode}`}
					name="fromDate"
					type="date"
					value={renvoyee?.fromDate ?? periode?.fromDate ?? data.today}
					required
				/>
			</div>
			<div>
				<label for={`a-${cleDeLaPeriode}`}>{text.periods.toLabel}</label>
				<input
					id={`a-${cleDeLaPeriode}`}
					name="toDate"
					type="date"
					value={renvoyee?.toDate ?? periode?.toDate ?? ''}
				/>
			</div>
		</div>
		<p class="aide">{text.periods.toHint}</p>

		{#if mode === 'shown'}
			<fieldset>
				<legend>{text.periods.shownTitle}</legend>
				<p class="aide">{text.periods.shownHint}</p>
				{@render heuresAffichees(cleDeLaPeriode, modele)}
			</fieldset>
		{/if}

		<!-- Les cinq iqamas. C'est ce qu'une organisation règle vraiment quand ses heures viennent du
		     calcul ou d'un fichier ; les heures affichées ne se saisissent alors que repliées. -->
		<fieldset>
			<legend>{text.periods.iqamaLegend}</legend>
			<p class="aide">{text.periods.iqamaHint}</p>
			<div class="defile">
				<table class="saisie">
					<thead>
						<tr>
							<th scope="col">{text.periods.colPrayer}</th>
							<th scope="col">{text.periods.iqamaAt}</th>
							<th scope="col">{text.periods.iqamaOffset}</th>
						</tr>
					</thead>
					<tbody>
						{#each PRIERES as priere (priere)}
							<tr>
								<th scope="row">
									<label for={`${priere}-iqama-${cleDeLaPeriode}`}>{prayer(priere)}</label>
								</th>
								<td>
									<input
										id={`${priere}-iqama-${cleDeLaPeriode}`}
										name={`${priere}Iqama`}
										type="time"
										value={modele?.iqama[priere].heure ?? ''}
									/>
								</td>
								<td>
									<input
										name={`${priere}IqamaOffset`}
										type="number"
										min="0"
										max="120"
										aria-label={text.periods.iqamaOffsetLabel(prayer(priere))}
										value={modele?.iqama[priere].decalage ?? ''}
									/>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</fieldset>

		{#if mode === 'iqama'}
			<details class="repli">
				<summary>{text.periods.shownFold}</summary>
				<p class="aide">{text.periods.shownFoldHint}</p>
				{@render heuresAffichees(cleDeLaPeriode, modele)}
			</details>
		{/if}

		<div class="boutons">
			<button type="submit" formaction={`?source=${choix}&/apercuPeriode`}>
				{text.periods.preview}
			</button>
		</div>
		{#if renvoyee && form?.apercuPeriode}
			<!-- Une période qui commence après les sept prochains jours : ses sept premiers jours, et
			     une phrase qui le dit, pour qu'elle ne paraisse pas absente de l'aperçu. Plus courte
			     que sept jours, elle est montrée en entier, et la phrase dit combien de jours elle dure. -->
			{@const depuis = form.apercuDepuis ?? null}
			{@const duree = form.apercuDuree ?? 7}
			{@const entiere = depuis !== null && duree < 7}
			<h4 id={`apercu-periode-titre-${cleDeLaPeriode}`}>
				{entiere
					? text.periods.previewTitleWhole
					: depuis
						? text.periods.previewTitleLater
						: text.periods.previewTitle}
			</h4>
			{#if depuis}
				<p class="aide">
					{entiere
						? text.periods.previewWhole(numericDate(depuis), duree)
						: text.periods.previewLater(numericDate(depuis))}
				</p>
			{/if}
			<p class="aide">{text.periods.previewHint}</p>
			{@render tableServie(
				form.apercuPeriode,
				{ titre: `apercu-periode-titre-${cleDeLaPeriode}` },
				entiere
					? text.periods.previewWholeEmpty
					: depuis
						? text.periods.previewLaterEmpty
						: text.served.empty
			)}
		{/if}
		<div class="boutons">
			<button type="submit" class="principal">{text.periods.save}</button>
		</div>
	</form>
{/snippet}

{#snippet heuresAffichees(cleDeLaPeriode: string, modele: { soleil: Periode['soleil'] } | null)}
	<div class="defile">
		<table class="saisie">
			<thead>
				<tr>
					<th scope="col">{text.periods.colPrayer}</th>
					<th scope="col">{text.periods.colShown}</th>
				</tr>
			</thead>
			<tbody>
				{#each PRIERES as priere (priere)}
					<tr>
						<th scope="row">
							<label for={`${priere}-${cleDeLaPeriode}`}>{prayer(priere)}</label>
						</th>
						<td>
							<input
								id={`${priere}-${cleDeLaPeriode}`}
								name={priere}
								type="time"
								value={modele?.soleil[priere] ?? ''}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<style>
	.intro {
		max-width: 42rem;
	}
	.question fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.question legend {
		font-weight: 700;
		font-size: 1.1rem;
		padding: 0 0.25rem;
	}
	.reponse {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		min-height: 44px;
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		cursor: pointer;
		font-weight: normal;
	}
	.reponse:has(input:checked) {
		border-color: var(--accent);
		background: #f6f8fb;
	}
	.reponse input {
		margin-block-start: 0.3rem;
		min-height: auto;
	}
	.reponse span {
		display: flex;
		flex-direction: column;
	}
	.reponse-choisie {
		border-block-start: 2px solid #ddd;
		margin-block-start: 1.5rem;
	}
	.repli {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
		margin-block: 0.5rem;
	}
	/* Le résumé d'un repli garde le triangle des `<details>`, qui dit qu'on peut l'ouvrir : il faut
	   pour cela qu'il reste en `list-item` (en `flex`, le navigateur le retirait). Ce triangle s'ouvre
	   sans JavaScript et se tourne de lui-même vers la gauche en arabe. Les 44 px de hauteur viennent
	   du remplissage : 24 px de ligne et deux fois 10. */
	.repli summary {
		cursor: pointer;
		display: list-item;
		box-sizing: border-box;
		min-height: 44px;
		padding-block: 0.625rem;
		font-weight: 600;
	}
	.resultats {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.resultat {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		font-weight: normal;
	}
	.resultat input {
		min-height: auto;
	}
	.choisie {
		background: #f6f8fb;
		border-inline-start: 4px solid var(--accent);
		padding: 0.5rem 0.75rem;
	}
	.credit {
		font-size: 0.8rem;
	}
	.periode {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-block-end: 1rem;
	}
	.periode h3 {
		margin-block-start: 0;
		font-size: 1rem;
	}
	.soleil {
		font-weight: 600;
	}
	.provenance,
	.iqama {
		display: block;
		font-size: 0.8rem;
		color: #555;
	}
	.saisie input[type='time'],
	.saisie input[type='number'] {
		width: 100%;
		min-width: 6rem;
	}
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 38rem;
	}
	.ligne {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.ligne input {
		flex: 1 1 12rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	input,
	select {
		font: inherit;
		min-height: 44px;
		padding: 0 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		max-width: 100%;
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.75rem;
		min-width: 0;
	}
	/* Deux colonnes sur un écran large, une seule sur un téléphone. Chaque étiquette reste
	   au-dessus de son champ : côte à côte, la seconde se retrouvait à côté du premier champ, et son
	   propre champ passait à la ligne suivante. */
	.position {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.75rem;
	}
	.position > div {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.decalages {
		display: grid;
		grid-template-columns: auto 6rem;
		gap: 0.35rem 0.75rem;
		align-items: center;
	}
	.aide {
		color: #555;
		font-size: 0.9rem;
	}
	.ramadan {
		margin: 1rem 0;
		padding: 0.75rem 1rem;
		border-inline-start: 3px solid #b8860b;
		background: #fdf8ec;
		border-radius: 4px;
		font-size: 0.9rem;
		color: #4a3c10;
	}
	.erreur {
		background: #fee2e2;
		border-inline-start: 4px solid #b91c1c;
		padding: 0.5rem 0.75rem;
	}
	.succes {
		background: #dcfce7;
		border-inline-start: 4px solid #15803d;
		padding: 0.5rem 0.75rem;
	}
	.avertissement {
		background: #fef3c7;
		border-inline-start: 4px solid #d97706;
		padding: 0.5rem 0.75rem;
	}
	.boutons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-block-start: 0.5rem;
	}
	button {
		min-height: 44px;
		font: inherit;
		padding: 0 0.9rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
		cursor: pointer;
	}
	button.principal {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		font-weight: 600;
	}
	/* Un tableau de sept jours est plus large qu'un téléphone : il défile seul, sans faire défiler la
	   page. Il prend le focus pour que les flèches du clavier le fassent défiler, et le montre. */
	.defile {
		overflow-x: auto;
		max-width: 100%;
	}
	.defile:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	table {
		border-collapse: collapse;
		margin-block-start: 0.5rem;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		border: 1px solid #eee;
		padding: 0.25rem 0.6rem;
		text-align: start;
		font-size: 0.95rem;
	}
	thead th {
		background: #f6f6f6;
	}
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0 0.3rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.rapport {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.75rem 1rem;
		margin-block-start: 1rem;
	}
	.refusees {
		font-size: 0.9rem;
		color: #555;
	}
	code {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
	}
</style>
