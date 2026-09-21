import { defineConfig } from 'vitest/config';

// Un seul fichier, sans dépendance à l'exécution : le widget n'est que du DOM.
export default defineConfig({
	build: {
		lib: {
			entry: 'src/index.ts',
			name: 'JadwalWidget',
			// Un seul format => un seul fichier, sans découpage en chunks. IIFE et non module :
			// une balise `<script src>` ordinaire doit suffire, sur un site qu'on ne contrôle pas.
			formats: ['iife'],
			fileName: () => 'jadwal-widget.js'
		},
		// Le fichier part sur le site de chaque mosquée : on ne lui joint pas une carte de sources
		// de plusieurs kilo-octets, et on ne publie pas les commentaires français du dépôt.
		sourcemap: false,
		target: 'es2022'
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts']
	}
});
