<script lang="ts">
	// Les textes sont dans `$lib/i18n/share.ts`, dans les cinq langues de l'espace (étape 18).
	//
	// Deux sortes de texte gardent leur propre langue, quelle que soit celle de l'écran, et le disent
	// par `lang` : chaque message de la semaine, écrit dans sa langue (retour D1), et les codes, dont
	// les quelques mots sont dans la langue de l'organisation. Un code se lit toujours de gauche à
	// droite, même dans un écran arabe.
	import { direction, type Langue } from '$lib/i18n.js';
	import { shareTexts } from '$lib/i18n/share.js';
	import { languesEnClair } from '$lib/public/affichage.js';

	let { data } = $props();

	const text = $derived(shareTexts[data.language]);
	/** Le nom d'une langue, écrit dans la langue de l'écran : « allemand », « Deutsch », « الألمانية ». */
	const nom = (langue: Langue) => languesEnClair(data.language, [langue]);
</script>

<svelte:head><title>{text.title} | {data.organisation.name}</title></svelte:head>

<h1>{text.title}</h1>
<p class="details">{text.intro}</p>

<section aria-labelledby="lien-titre">
	<h2 id="lien-titre">{text.link.title}</h2>
	<p class="details" id="lien-aide">{text.link.help}</p>
	<input
		type="text"
		readonly
		value={data.lienPublic}
		aria-labelledby="lien-titre"
		aria-describedby="lien-aide"
		dir="ltr"
	/>
	<p><a href={data.lienPublic}>{text.link.open}</a></p>
</section>

<section aria-labelledby="semaine-titre">
	<h2 id="semaine-titre">{text.week.title}</h2>
	<p class="details">{text.week.help}</p>
	{#if data.messages.length > 1}<p class="details">{text.week.languages}</p>{/if}
	{#each data.messages as message, index (message.language)}
		<!-- La langue de l'organisation d'abord, ouverte ; les autres s'ouvrent au besoin, sans script. -->
		<details class="message" open={index === 0}>
			<summary>
				{text.week.in(nom(message.language))}
				{#if index === 0}({text.week.main}){/if}
			</summary>
			<textarea
				readonly
				rows="10"
				lang={message.language}
				dir={direction(message.language)}
				aria-label={text.week.label(nom(message.language))}>{message.text}</textarea
			>
		</details>
	{/each}
</section>

<section aria-labelledby="qr-titre">
	<h2 id="qr-titre">{text.qr.title}</h2>
	<p class="details">{text.qr.help}</p>
	<div class="qr">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- le SVG vient de `qrSvg`, jamais d'une saisie -->
		{@html data.qr}
	</div>
	<p>
		<a
			class="bouton"
			download={`jadwal-${data.organisation.slug}.svg`}
			href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.qr)}`}
		>
			{text.qr.download}
		</a>
	</p>
</section>

<section aria-labelledby="code-titre">
	<h2 id="code-titre">{text.code.title}</h2>
	<p class="details">{text.code.intro}</p>
	<p class="details">{text.code.ownLook}</p>

	<h3>{text.code.simpleTitle}</h3>
	<p class="details">{text.code.simpleWhere}</p>
	<p class="details">{text.code.simpleSomeoneElse}</p>
	<label for="code-site">{text.code.simpleLabel}</label>
	<textarea id="code-site" readonly rows="4" lang={data.langueDuCode} dir="ltr" spellcheck="false"
		>{data.codeEmbarque}</textarea
	>

	<h3>{text.code.frameTitle}</h3>
	<p class="details">{text.code.frameWhere}</p>
	<p class="details">{text.code.frameHeight(data.hauteurCadre, data.hauteurCadre + 300)}</p>
	<label for="code-cadre">{text.code.frameLabel}</label>
	<textarea id="code-cadre" readonly rows="3" lang={data.langueDuCode} dir="ltr" spellcheck="false"
		>{data.codeCadre}</textarea
	>

	<h3>{text.code.lockedTitle}</h3>
	<p class="details">{text.code.lockedWhere}</p>
	<label for="code-verrouille">{text.code.lockedLabel}</label>
	<textarea
		id="code-verrouille"
		readonly
		rows="6"
		lang={data.langueDuCode}
		dir="ltr"
		spellcheck="false">{data.codeVerrouille}</textarea
	>
</section>

<style>
	textarea,
	input[type='text'] {
		box-sizing: border-box;
		width: 100%;
		font: inherit;
		min-height: 44px;
		padding: 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
	}
	.details {
		color: #555;
		font-size: 0.95rem;
	}
	h3 {
		font-size: 1rem;
		margin: 1.25rem 0 0.25rem;
	}
	label {
		display: block;
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.25rem;
	}
	.message {
		margin-top: 0.5rem;
	}
	/* Le triangle du navigateur reste : c'est lui qui dit qu'on peut ouvrir. */
	summary {
		cursor: pointer;
		font-weight: 600;
		padding: 0.65rem 0;
	}
	.qr {
		max-width: 14rem;
	}
	.qr :global(svg) {
		width: 100%;
		height: auto;
	}
	.bouton {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		background: var(--accent);
		color: var(--accent-texte);
		text-decoration: none;
	}
</style>
