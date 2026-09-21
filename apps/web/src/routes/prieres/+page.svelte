<script lang="ts">
	// Les heures de prière. Trois sections, dans l'ordre où l'on s'en sert : d'où viennent les
	// heures aujourd'hui, comment les calculer, comment importer un calendrier.
	import { resolve } from '$app/paths';
	import { PRAYER_LABELS } from '$lib/format.js';

	let { data, form } = $props();

	const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

	/** Comment chaque source se nomme à l'écran. Trois mots, jamais des codes. */
	const SOURCES: Record<string, string> = {
		manual: 'saisi',
		import: 'importé',
		computed: 'calculé'
	};

	/** Les sept jours réellement servis, sans les jours qu'aucune source ne couvre. */
	const servies = $derived(
		data.septJours.filter((jour) => PRIERES.some((priere) => jour[priere] !== null))
	);

	/** Vrai un vendredi, quand des sessions existent : ce sont elles qui tiennent lieu de Dhuhr. */
	function jumuaCeJourLa(date: string): boolean {
		if (data.vendredi.length === 0) return false;
		// Le jour de semaine sans objet `Date` : `1970-01-01` était un jeudi.
		const jours = Math.round(
			(Date.parse(`${date}T00:00:00Z`) - Date.parse('1970-01-01T00:00:00Z')) / 86400000
		);
		return ((jours + 3) % 7) + 1 === 5;
	}

	/** La période dont le formulaire est ouvert : `'nouvelle'`, un identifiant, ou rien. */
	let periodeOuverte = $state<string | null>(null);

	/**
	 * La dernière période saisie. Une période nouvelle part de ses valeurs : une mosquée qui change
	 * de saison ne resaisit que ce qui change, et dans la plupart des cas rien ne change sauf les
	 * heures fixes du Fajr et du Dhuhr.
	 */
	const derniere = $derived(data.periodes.at(-1) ?? null);

	const NOM_DE_REGLE: Record<string, string> = {
		middleofthenight: 'Milieu de la nuit',
		seventhofthenight: 'Dernier septième de la nuit',
		twilightangle: 'Proportionnelle à l’angle'
	};
	const NOM_D_ECOLE: Record<string, string> = {
		shafi: 'Shafi’i, Maliki, Hanbali (ombre simple)',
		hanafi: 'Hanafi (ombre double)'
	};

	/** L'aperçu montré : celui du formulaire s'il vient d'être demandé, sinon celui des réglages. */
	const jours = $derived(form?.apercuCalcule ?? data.apercu);
	const lecture = $derived(form?.lecture);
</script>

<svelte:head><title>Heures de prière | {data.organisation.name}</title></svelte:head>

<h1>Heures de prière</h1>

{#if form?.erreur}<p class="erreur" role="alert">{form.erreur}</p>{/if}
{#if form?.periodeEnregistree}<p class="succes" role="status">Période enregistrée.</p>{/if}
{#if form?.periodeDupliquee}
	<p class="succes" role="status">
		Période dupliquée aux mêmes dates, un an plus tard. Vérifiez-les, puis enregistrez-la.
	</p>
{/if}
{#if form?.periodeSupprimee}<p class="succes" role="status">Période supprimée.</p>{/if}
{#if form?.enregistre}
	<p class="succes" role="status">
		Réglages enregistrés. {form.ecrites} jour{form.ecrites > 1 ? 's' : ''} recalculé{form.ecrites >
		1
			? 's'
			: ''}.
	</p>
{/if}
{#if form?.importe}
	<p class="succes" role="status">
		{form.importe} jours importés, du {form.premiere} au {form.derniere}.
	</p>
{/if}
{#if form?.efface !== undefined}
	<p class="succes" role="status">
		{form.efface} jour{form.efface > 1 ? 's' : ''} retiré{form.efface > 1 ? 's' : ''} de l’import. Le
		calcul reprend la main.
	</p>
{/if}

<section aria-labelledby="etat-titre">
	<h2 id="etat-titre">D’où viennent les heures aujourd’hui</h2>
	{#if data.etat.finDeLImport}
		<p>
			Votre calendrier importé va jusqu’au <strong>{data.etat.finDeLImport}</strong>.
			{#if data.etat.calculPossible}
				Au-delà, les heures sont calculées.
			{:else}
				Au-delà, il n’y a aucune heure : renseignez une position ci-dessous pour que le calcul
				prenne le relais.
			{/if}
		</p>
		{#if data.etat.alerte}
			<p class="avertissement" role="status">
				Il reste {data.etat.joursRestants} jour{(data.etat.joursRestants ?? 0) > 1 ? 's' : ''}
				de calendrier importé. Importez la suite, ou laissez le calcul prendre le relais.
			</p>
		{/if}
	{:else if data.etat.calculPossible}
		<p>Toutes les heures sont <strong>calculées</strong>. Aucun calendrier n’a été importé.</p>
	{:else}
		<p class="avertissement" role="status">
			Aucune heure de prière n’est disponible. Les cours qui suivent une prière s’affichent sans
			heure, par exemple « Après Maghrib ». Renseignez une position, ou importez un calendrier.
		</p>
	{/if}
</section>

<section aria-labelledby="calcul-titre">
	<h2 id="calcul-titre">Calcul</h2>
	<p class="aide">
		Les heures calculées ne remplacent jamais un jour importé : elles comblent ce que le calendrier
		ne couvre pas.
	</p>

	<form method="post" class="colonne">
		<fieldset>
			<legend>Position de la mosquée</legend>
			<div class="position">
				<div>
					<label for="latitude">Latitude</label>
					<input
						id="latitude"
						name="latitude"
						type="text"
						inputmode="decimal"
						value={data.reglages.latitude ?? ''}
						placeholder="47.1368"
					/>
				</div>
				<div>
					<label for="longitude">Longitude</label>
					<input
						id="longitude"
						name="longitude"
						type="text"
						inputmode="decimal"
						value={data.reglages.longitude ?? ''}
						placeholder="7.2468"
					/>
				</div>
			</div>
			<p class="aide">
				En degrés décimaux. Pour les trouver : ouvrez une carte, faites un clic droit sur votre
				mosquée, puis copiez les deux nombres qui s’affichent. Le premier est la latitude. Nous
				n’interrogeons aucun service de cartographie : ces deux nombres restent chez nous.
			</p>
		</fieldset>

		<label for="method">Méthode de calcul</label>
		<select id="method" name="method">
			{#each data.methodes as methode (methode)}
				<option
					value={methode}
					selected={methode === (data.reglages.method ?? 'MuslimWorldLeague')}
				>
					{methode}
				</option>
			{/each}
		</select>
		<p class="aide">
			En cas de doute, gardez <code>MuslimWorldLeague</code> : c’est la méthode la plus répandue en Europe.
		</p>

		<label for="madhab">École pour l’Asr</label>
		<select id="madhab" name="madhab">
			{#each data.ecoles as ecole (ecole)}
				<option value={ecole} selected={ecole === data.reglages.madhab}>
					{NOM_D_ECOLE[ecole] ?? ecole}
				</option>
			{/each}
		</select>

		<label for="highLatitudeRule">Règle pour les nuits courtes</label>
		<select id="highLatitudeRule" name="highLatitudeRule">
			{#each data.regles as regle (regle)}
				<option value={regle} selected={regle === data.reglages.high_latitude_rule}>
					{NOM_DE_REGLE[regle] ?? regle}
				</option>
			{/each}
		</select>
		<p class="aide">
			En juin, à nos latitudes, la nuit est si courte que l’Isha tombe après minuit. Le
			<strong>milieu de la nuit</strong> garde les heures astronomiques telles quelles ; le
			<strong>dernier septième</strong> avance l’Isha et retarde le Fajr, ce qui donne des heures
			plus praticables. Regardez l’aperçu de juin avant de choisir.
			{#if data.recommandee}
				Pour votre position, la valeur usuelle est « {NOM_DE_REGLE[data.recommandee]} ».
			{/if}
		</p>

		<fieldset>
			<legend>Ajustement par prière, en minutes</legend>
			<div class="decalages">
				{#each PRIERES as priere (priere)}
					<label for={`${priere}Adjustment`}>{PRAYER_LABELS[priere] ?? priere}</label>
					<input
						id={`${priere}Adjustment`}
						name={`${priere}Adjustment`}
						type="number"
						min="-120"
						max="120"
						value={data.reglages[`${priere}_adjustment`]}
					/>
				{/each}
			</div>
			<p class="aide">Pour aligner le calcul sur ce que votre mosquée annonce déjà.</p>
		</fieldset>

		<label for="source">Source que vous déclarez</label>
		<select id="source" name="source">
			<option value="import" selected={data.reglages.source === 'import'}>
				J’importe mon calendrier
			</option>
			<option value="computed" selected={data.reglages.source === 'computed'}>
				Je m’en remets au calcul
			</option>
		</select>

		<div class="boutons">
			<button type="submit" formaction="?/apercu">Voir l’aperçu</button>
			<button type="submit" formaction="?/enregistrer" class="principal">Enregistrer</button>
		</div>
	</form>
</section>

<section aria-labelledby="servies-titre">
	<h2 id="servies-titre">Ce qui est servi les sept prochains jours</h2>
	<p class="aide">
		Les trois sources résolues, dans l’ordre : ce que vous avez <strong>saisi</strong> passe avant
		ce que vous avez <strong>importé</strong>, qui passe avant le <strong>calcul</strong>. Sous
		chaque heure, l’iqama quand vous en avez réglé une : c’est elle qui donne l’heure d’un cours «
		après Maghrib ».
	</p>
	{#if servies.length === 0}
		<p class="aide">
			Aucune heure pour les sept prochains jours. Saisissez une période ci-dessous, importez un
			calendrier, ou renseignez une position pour que le calcul prenne le relais.
		</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th scope="col">Jour</th>
					{#each data.prieres as priere (priere)}
						<th scope="col">{PRAYER_LABELS[priere] ?? priere}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each servies as jour (jour.date)}
					<tr>
						<th scope="row">{jour.date}</th>
						{#each data.prieres as priere (priere)}
							<td>
								{#if jour[priere]}
									<span class="soleil">{String(jour[priere]).slice(0, 5)}</span>
									<span class="provenance">{SOURCES[jour[`${priere}_source`] ?? ''] ?? ''}</span>
									{#if priere === 'dhuhr' && jumuaCeJourLa(jour.date)}
										<!-- Le vendredi, les sessions remplacent le Dhuhr : afficher son iqama
										     ici ferait exactement la contradiction qu'on veut supprimer. -->
										<span class="iqama">
											Jumu’a {data.vendredi.map((session) => session.start).join(', ')}
										</span>
									{:else if jour[`${priere}_iqama`]}
										<span class="iqama">iqama {String(jour[`${priere}_iqama`]).slice(0, 5)}</span>
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
	{/if}
</section>

<section aria-labelledby="periodes-titre">
	<h2 id="periodes-titre">Vos horaires, saisis à la main</h2>
	<p class="aide">
		Une période, c’est ce que vous imprimez sur votre panneau : un nom, des dates, et pour chaque
		prière l’heure affichée et l’heure d’iqama. Laissez une heure vide pour que l’import ou le
		calcul la donne. Laissez la date de fin vide pour « jusqu’à nouvel ordre » : c’est le réglage
		d’une mosquée qui pose ses iqamas une fois et n’y revient plus.
	</p>
	<p class="aide">
		Deux périodes ne peuvent pas se chevaucher : fermez celle qui précède avant d’en ouvrir une
		autre. Les vendredis, ce sont vos <a href={resolve('/vendredi')}>sessions du vendredi</a> qui remplacent
		le Dhuhr.
	</p>

	{#each data.periodes as periode (periode.id)}
		<div class="periode">
			<h3>
				{periode.name}
				{#if periode.needsReview}
					<span class="marque" title="Dates reportées d’un an par la duplication">
						dates à vérifier
					</span>
				{/if}
			</h3>
			<p class="aide">
				Du {periode.fromDate}
				{periode.toDate ? `au ${periode.toDate}` : '(jusqu’à nouvel ordre)'}
			</p>
			{#if periode.needsReview}
				<p class="avertissement">
					Ces dates viennent d’une duplication : les mêmes jours, un an plus tard, parce que les
					heures de prière suivent le soleil et non le calendrier hégirien. Vérifiez-les,
					corrigez-les si besoin, puis enregistrez : la mention disparaîtra.
				</p>
			{/if}
			<table>
				<thead>
					<tr>
						<th scope="col">Prière</th>
						<th scope="col">Heure affichée</th>
						<th scope="col">Iqama</th>
					</tr>
				</thead>
				<tbody>
					{#each data.prieres as priere (priere)}
						<tr>
							<th scope="row">{PRAYER_LABELS[priere] ?? priere}</th>
							<td>{periode.soleil[priere] ?? '–'}</td>
							<td>
								{#if periode.iqama[priere].heure}
									{periode.iqama[priere].heure}
								{:else if periode.iqama[priere].decalage !== null}
									+ {periode.iqama[priere].decalage} min
								{:else}
									–
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="boutons">
				<button
					type="button"
					aria-expanded={periodeOuverte === periode.id}
					onclick={() => (periodeOuverte = periodeOuverte === periode.id ? null : periode.id)}
				>
					Modifier
				</button>
				<form method="post" action="?/dupliquerPeriode">
					<input type="hidden" name="periodeId" value={periode.id} />
					<button type="submit">Dupliquer pour l’année suivante</button>
				</form>
				<form method="post" action="?/supprimerPeriode">
					<input type="hidden" name="periodeId" value={periode.id} />
					<button type="submit">Supprimer</button>
				</form>
			</div>
			<div class="repli" class:ferme={periodeOuverte !== null && periodeOuverte !== periode.id}>
				{@render formulairePeriode(periode)}
			</div>
		</div>
	{/each}

	<div class="periode">
		<h3>Ajouter une période</h3>
		{#if derniere}
			<p class="aide">
				Les valeurs de « {derniere.name} » sont déjà remplies : ne changez que ce qui change.
			</p>
		{/if}
		<div class="repli" class:ferme={periodeOuverte !== null && periodeOuverte !== 'nouvelle'}>
			{@render formulairePeriode(null)}
		</div>
		<div class="boutons">
			<button
				type="button"
				aria-expanded={periodeOuverte === 'nouvelle'}
				onclick={() => (periodeOuverte = periodeOuverte === 'nouvelle' ? null : 'nouvelle')}
			>
				Ajouter une période
			</button>
		</div>
	</div>
</section>

<section aria-labelledby="apercu-titre">
	<h2 id="apercu-titre">Ce que le calcul donnerait, sur sept jours</h2>
	{#if jours.length === 0}
		<p class="aide">
			Renseignez une position, puis cliquez sur « Voir l’aperçu » : les heures s’affichent ici avant
			d’être enregistrées.
		</p>
	{:else}
		{#if form?.apercuCalcule}
			<p class="aide">
				Calculé avec ce que porte le formulaire, <strong>sans rien enregistrer</strong>. Comparez au
				panneau de votre mosquée, puis cliquez sur « Enregistrer ».
			</p>
		{/if}
		<table>
			<thead>
				<tr>
					<th scope="col">Jour</th>
					{#each PRIERES as priere (priere)}
						<th scope="col">{PRAYER_LABELS[priere] ?? priere}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each jours as jour (jour.date)}
					<tr>
						<th scope="row">{jour.date}</th>
						{#each PRIERES as priere (priere)}
							<td>
								{jour[priere]}
								{#if priere === 'isha' && jour.apresMinuit}
									<span class="marque" title="Cette heure appartient au lendemain"
										>le lendemain</span
									>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<section aria-labelledby="import-titre">
	<h2 id="import-titre">Importer un calendrier</h2>
	<p class="aide">
		Un fichier CSV, une ligne par jour, avec les colonnes <code>date</code>, <code>fajr</code>,
		<code>dhuhr</code>, <code>asr</code>, <code>maghrib</code>, <code>isha</code>. Les dates
		s’écrivent <code>2026-09-21</code> et les heures <code>19:23</code>. Le point-virgule d’Excel
		est accepté, et une colonne du lever du soleil est ignorée sans erreur. Taille acceptée :
		{data.tailleMaximale}.
	</p>

	<!-- Le format en entier, replié : la personne qui envoie l'export de sa fédération en a besoin,
	     celle qui a déjà le bon fichier n'a pas à le lire. `details` n'a besoin d'aucun script. -->
	<details class="format">
		<summary>Le format en détail</summary>
		<p class="aide">
			L’ordre des colonnes n’a pas d’importance : c’est le nom de l’en-tête qui compte, lu sans
			tenir compte de la casse ni des accents.
		</p>
		<ul class="aide">
			<li><code>date</code>, <code>jour</code>, <code>day</code> ou <code>tag</code></li>
			<li>
				<code>fajr</code>, <code>fadjr</code>, <code>fadjer</code>, <code>sobh</code>,
				<code>subh</code> ou <code>imsak</code>
			</li>
			<li>
				<code>dhuhr</code>, <code>duhr</code>, <code>zuhr</code>, <code>dohr</code>,
				<code>dhohr</code> ou <code>midi</code>
			</li>
			<li><code>asr</code>, <code>assr</code> ou <code>aser</code></li>
			<li>
				<code>maghrib</code>, <code>maghreb</code>, <code>magrib</code> ou <code>coucher</code>
			</li>
			<li>
				<code>isha</code>, <code>icha</code>, <code>ishaa</code>, <code>ichaa</code> ou
				<code>isya</code>
			</li>
		</ul>
		<p class="aide">
			Dates : <code>2027-01-01</code>, <code>01/01/2027</code>, <code>01.01.2027</code> ou
			<code>1-1-2027</code>. Heures : <code>19:23</code>, <code>9:23</code>,
			<code>19:23:00</code>, <code>19h23</code> ou <code>7:23 PM</code>. Des secondes non nulles
			sont refusées, parce qu’elles signalent presque toujours une colonne mal alignée.
		</p>
		<p class="aide">
			Les heures sont locales, dans le fuseau de votre organisation : ne convertissez rien, et ne
			vous occupez pas du changement d’heure. Une Isha après minuit s’écrit <code>00:41</code> sur la
			ligne du jour de la prière, pas sur celle du lendemain.
		</p>
		<p class="aide">
			Guillemets, marque d’ordre des octets, fins de ligne Windows, UTF-8, UTF-16 et Windows-1252
			passent sans rien faire. L’encodage retenu est affiché dans l’aperçu.
		</p>
	</details>

	<p class="aide">
		<a href={resolve('/prieres/modele.csv')} download>
			Télécharger un modèle des soixante prochains jours
		</a>
		: déjà rempli avec vos réglages actuels. Corrigez ce qui diffère de votre panneau dans un tableur,
		puis renvoyez-le ici.
	</p>

	<form method="post" action="?/lireFichier" enctype="multipart/form-data" class="colonne">
		<label for="calendrier">Fichier</label>
		<input
			id="calendrier"
			name="calendrier"
			type="file"
			accept=".csv,text/csv,text/plain"
			required
		/>

		<label for="ordre">Si les dates s’écrivent en chiffres seuls</label>
		<select id="ordre" name="ordre">
			<option value="auto">Deviner (recommandé)</option>
			<option value="jour-mois">Jour puis mois (21/09/2026)</option>
			<option value="mois-jour">Mois puis jour (09/21/2026)</option>
		</select>

		<div class="ligne">
			<label for="annee">Année du fichier</label>
			<input id="annee" name="annee" type="number" min="2020" max="2100" placeholder="2026" />
			<label for="mois">Mois, si le fichier n’en couvre qu’un</label>
			<input id="mois" name="mois" type="number" min="1" max="12" placeholder="9" />
		</div>
		<p class="aide">
			Utile pour un export mensuel dont la colonne de dates ne contient qu’un quantième.
		</p>

		<button type="submit">Lire le fichier</button>
	</form>

	{#if lecture}
		<div class="rapport">
			<h3>Ce que nous avons lu dans « {lecture.nom} »</h3>
			<ul>
				<li>Encodage : {lecture.encodage}. Séparateur : « {lecture.separateur} ».</li>
				<li>
					<strong>{lecture.jours} jours</strong>
					{#if lecture.premiere}, du {lecture.premiere} au {lecture.derniere}{/if}.
				</li>
				{#if lecture.manquants.length > 0}
					<li>
						{lecture.manquants.length} jour{lecture.manquants.length > 1 ? 's' : ''} manquant{lecture
							.manquants.length > 1
							? 's'
							: ''} dans cet intervalle : {lecture.manquants.slice(0, 8).join(', ')}{lecture
							.manquants.length > 8
							? '…'
							: ''}
					</li>
				{/if}
				{#if lecture.refusees.length > 0}
					<li>
						{lecture.refusees.length} ligne{lecture.refusees.length > 1 ? 's' : ''} refusée{lecture
							.refusees.length > 1
							? 's'
							: ''}.
					</li>
				{/if}
			</ul>

			{#if lecture.ordreAmbigu}
				<p class="avertissement" role="alert">
					Les dates de ce fichier se lisent de deux façons, jour/mois ou mois/jour, et les deux
					donnent un calendrier valide. Nous ne devinons pas : choisissez l’ordre ci-dessus, puis
					relisez le fichier.
				</p>
			{/if}

			{#if lecture.refusees.length > 0}
				<h4>Lignes refusées</h4>
				<ul class="refusees">
					{#each lecture.refusees.slice(0, 20) as refusee (refusee.ligne + refusee.raison)}
						<li>Ligne {refusee.ligne} : {refusee.raison}</li>
					{/each}
				</ul>
				{#if lecture.refusees.length > 20}
					<p class="aide">…et {lecture.refusees.length - 20} autres.</p>
				{/if}
			{/if}

			{#if lecture.avertissements.length > 0}
				<h4>À vérifier</h4>
				<ul class="refusees">
					{#each lecture.avertissements.slice(0, 20) as avertissement (avertissement.message)}
						<li>{avertissement.message}</li>
					{/each}
				</ul>
				<p class="aide">
					Ces jours seront importés tels quels : un écart peut être une correction volontaire.
				</p>
			{/if}

			{#if lecture.extrait.length > 0}
				<h4>Les premiers jours</h4>
				<table>
					<thead>
						<tr>
							<th scope="col">Jour</th>
							{#each PRIERES as priere (priere)}
								<th scope="col">{PRAYER_LABELS[priere] ?? priere}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each lecture.extrait as jour (jour.date)}
							<tr>
								<th scope="row">{jour.date}</th>
								{#each PRIERES as priere (priere)}
									<td>{jour[priere]}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			{#if lecture.jours > 0}
				<form method="post" action="?/confirmer">
					<input type="hidden" name="aConfirmer" value={lecture.aConfirmer} />
					<p class="aide">
						Rien n’a encore été enregistré. Confirmer remplacera les jours couverts par ce fichier,
						et ne touchera à aucun autre.
					</p>
					<button type="submit" class="principal">
						Enregistrer ces {lecture.jours} jours
					</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if data.etat.finDeLImport}
		<h3>Retirer des jours importés</h3>
		<p class="aide">
			Les jours retirés repassent au calcul, s’il est configuré. Le journal des modifications en
			garde la trace.
		</p>
		<form method="post" action="?/effacer" class="ligne">
			<label for="de">Du</label>
			<input id="de" name="de" type="date" required />
			<label for="a">au</label>
			<input id="a" name="a" type="date" required />
			<button type="submit">Retirer</button>
		</form>
	{/if}
</section>

{#snippet formulairePeriode(periode: (typeof data.periodes)[number] | null)}
	{@const cle = periode?.id ?? 'nouvelle'}
	{@const modele = periode ?? derniere}
	<form method="post" action="?/periode" class="colonne">
		{#if periode}<input type="hidden" name="periodeId" value={periode.id} />{/if}

		<label for={`nom-${cle}`}>Nom</label>
		<input
			id={`nom-${cle}`}
			name="name"
			type="text"
			maxlength="60"
			value={periode?.name ?? ''}
			placeholder="Hiver 2027"
			required
		/>

		<div class="position">
			<div>
				<label for={`de-${cle}`}>À partir du</label>
				<input
					id={`de-${cle}`}
					name="fromDate"
					type="date"
					value={periode?.fromDate ?? data.today}
					required
				/>
			</div>
			<div>
				<label for={`a-${cle}`}>Jusqu’au</label>
				<input id={`a-${cle}`} name="toDate" type="date" value={periode?.toDate ?? ''} />
			</div>
		</div>
		<p class="aide">Laissez la date de fin vide pour « jusqu’à nouvel ordre ».</p>

		<!-- Les cinq iqamas, et elles seules. C'est ce qu'une mosquée règle vraiment ; les heures du
		     soleil viennent du calcul ou de l'import dans la quasi-totalité des cas, et les demander
		     en premier ferait croire qu'il faut les saisir. -->
		<table class="saisie">
			<thead>
				<tr>
					<th scope="col">Prière</th>
					<th scope="col">Iqama à</th>
					<th scope="col">ou après</th>
				</tr>
			</thead>
			<tbody>
				{#each data.prieres as priere (priere)}
					<tr>
						<th scope="row">
							<label for={`${priere}-iqama-${cle}`}>{PRAYER_LABELS[priere] ?? priere}</label>
						</th>
						<td>
							<input
								id={`${priere}-iqama-${cle}`}
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
								aria-label={`Iqama du ${PRAYER_LABELS[priere] ?? priere}, minutes après`}
								value={modele?.iqama[priere].decalage ?? ''}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="aide">
			Pour chaque prière, une heure d’iqama <strong>ou</strong> un nombre de minutes après l’heure affichée
			: jamais les deux. Un décalage suit le soleil tout seul ; une heure fixe ne bouge pas, pas même
			au changement d’heure, ce qui est voulu.
		</p>

		<details class="soleil-saisi">
			<summary>Saisir aussi les heures affichées</summary>
			<p class="aide">
				À ne remplir que si les heures de votre panneau diffèrent de celles que le calcul ou
				l’import donnent. Une case vide laisse la source précédente décider, prière par prière.
			</p>
			<table class="saisie">
				<thead>
					<tr>
						<th scope="col">Prière</th>
						<th scope="col">Heure affichée</th>
					</tr>
				</thead>
				<tbody>
					{#each data.prieres as priere (priere)}
						<tr>
							<th scope="row">
								<label for={`${priere}-${cle}`}>{PRAYER_LABELS[priere] ?? priere}</label>
							</th>
							<td>
								<input
									id={`${priere}-${cle}`}
									name={priere}
									type="time"
									value={modele?.soleil[priere] ?? ''}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>

		<button type="submit" class="principal">Enregistrer cette période</button>
	</form>
{/snippet}

<style>
	.format {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
	}
	.format summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.format ul {
		padding-left: 1.25rem;
	}
	.periode {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}
	.periode h3 {
		margin-top: 0;
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
	.soleil-saisi {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
	}
	.soleil-saisi summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: 600;
		font-size: 0.9rem;
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
		max-width: 34rem;
	}
	.ligne {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
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
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.75rem;
	}
	/* Deux colonnes sur un écran large, une seule sur un téléphone. Chaque étiquette reste
	   au-dessus de son champ : côte à côte, « Longitude » se retrouvait à droite du champ de
	   latitude, et son propre champ passait à la ligne suivante. */
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
	.erreur {
		background: #fee2e2;
		border-left: 4px solid #b91c1c;
		padding: 0.5rem 0.75rem;
	}
	.succes {
		background: #dcfce7;
		border-left: 4px solid #15803d;
		padding: 0.5rem 0.75rem;
	}
	.avertissement {
		background: #fef3c7;
		border-left: 4px solid #d97706;
		padding: 0.5rem 0.75rem;
	}
	.boutons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
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
	table {
		border-collapse: collapse;
		margin-top: 0.5rem;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		border: 1px solid #eee;
		padding: 0.25rem 0.6rem;
		text-align: left;
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
		margin-top: 1rem;
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
