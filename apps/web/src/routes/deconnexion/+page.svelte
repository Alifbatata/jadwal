<script lang="ts">
	import { resolve } from '$app/paths';
	import { signOutTexts } from '$lib/i18n/sign-out.js';

	let { data } = $props();
	const text = $derived(signOutTexts[data.language]);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>
<p>{text.text}</p>
<p><a href={resolve('/connexion')}>{text.signInAgain}</a></p>
