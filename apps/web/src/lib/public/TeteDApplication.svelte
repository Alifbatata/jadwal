<script lang="ts">
	// Ce que l'en-tête d'une page publique annonce pour qu'on l'installe comme une application
	// (étape 24, ADR 0053) : le manifeste de l'organisation, sa couleur pour la barre du système, et
	// ses icônes. Des balises, sans script.
	//
	// Jamais dans le cadre du widget, qui encadre un programme et non une application : c'est
	// l'appelant qui ne rend pas ce composant en mode intégré.
	import { resolve } from '$app/paths';
	import { accentValide } from '#lib/couleur.js';
	import type { Adresse } from './liens.js';

	let { adresse, couleur }: { adresse: Adresse; couleur: string } = $props();

	const accent = $derived(accentValide(couleur));
	/** La couleur dans l'adresse d'une icône : quand elle change, l'adresse change. */
	const icone = (fichier: string) =>
		`${resolve('/m/[slug]/icone/[fichier]', { slug: adresse.slug, fichier })}?c=${accent.slice(1)}`;
	/** Le manifeste, dans la langue de la page : l'application s'ouvrira dans cette langue. */
	const manifeste = $derived(
		`${resolve('/m/[slug]/manifest.webmanifest', { slug: adresse.slug })}${
			adresse.langue === adresse.langueParDefaut ? '' : `?lang=${adresse.langue}`
		}`
	);
</script>

<svelte:head>
	<link rel="manifest" href={manifeste} />
	<meta name="theme-color" content={accent} />
	<link rel="icon" type="image/png" sizes="192x192" href={icone('192.png')} />
	<link rel="apple-touch-icon" href={icone('180.png')} />
</svelte:head>
