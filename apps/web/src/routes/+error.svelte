<script lang="ts">
	// La page d'erreur de l'espace des responsables, dans la langue de l'espace (étape 18).
	//
	// Rendue dans la coquille, avec son en-tête et son choix de la langue. Elle dit ce qui arrive et ce
	// que la personne peut faire, selon le code de la réponse ; elle ne recopie jamais le message de
	// l'erreur, écrit pour celui qui lit le code. Les adresses publiques ont la leur, sous `/m/`.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Langue } from '$lib/i18n.js';
	import { errorTexts } from '$lib/i18n/error.js';

	const text = $derived(errorTexts[(page.data['language'] as Langue | undefined) ?? 'fr']);
	const shown = $derived(
		page.status === 404
			? text.notFound
			: page.status === 403
				? text.forbidden
				: page.status === 429
					? text.tooMany
					: text.other
	);
</script>

<svelte:head><title>{shown.title} | jadwal</title></svelte:head>

<h1>{shown.title}</h1>
<p>{shown.text}</p>
<p><a href={resolve('/')}>{text.home}</a></p>
