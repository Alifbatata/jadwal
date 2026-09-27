# La console du super-admin et l'écran de la passkey

Décrit après le code, à l'étape 18 (retour B2, et B1, D2, A3 pour ces écrans). Textes :
`apps/web/src/lib/i18n/super-admin.ts` et `super-admin-passkey.ts`, dans les cinq langues. Les
pouvoirs du super-admin sont dans l'ADR 0025.

## La console, `/super-admin`

Réservée à l'exploitant, avec les pouvoirs d'une passkey ; sans eux, l'écran de la passkey.

1. Titre de niveau 1 : `Super-admin`, puis `Cet écran sert à la personne qui exploite le service :
créer les organisations, régler leur plan et leur état, entrer dans leur espace pour les aider, et
dépanner une connexion.`
2. **Organisations**, avec, une seule fois au-dessus de la liste, ce que fait chaque geste :
   - `Entrer dans son espace` : `Vous y voyez et modifiez tout, comme sa personne responsable. Une
bannière le rappelle en haut de chaque écran.`
   - `Plan` : `Noté pour le suivi. Aucun paiement n'est demandé pour le moment, et le plan ne change
rien à ce que l'organisation peut faire.`
   - `État` : `Une organisation suspendue n'a plus de page publique : ni sa page, ni son widget, ni
son agenda ne s'affichent. Rien n'est effacé, et vous pouvez la réactiver.`

   Chaque organisation : son nom, `Page publique :` et son adresse complète en lien (avant :
   l'identifiant seul), `Entrer dans son espace`, le plan en mots (`Gratuit`, `Offert`, `Payant`)
   avec `Enregistrer le plan`, l'état (`Active`, `Suspendue`) avec `Enregistrer l'état`. Les deux
   boutons s'appelaient `Changer`. Après un geste : `Plan enregistré pour <organisation>.` Sans
   organisation : `Aucune organisation pour le moment. Créez la première avec le formulaire
ci-dessous.`

3. **Créer une organisation** (avant : « Ouvrir une organisation ») : `Une organisation est l'espace
d'une association, d'une école ou d'un club : son programme, ses membres et sa page publique.`
   - `Nom de l'organisation`, avec `Tel qu'il s'affichera sur sa page publique.` et
     `Exemple : Association Horizon` (en arabe, `جمعية الأفق`). Le champ prend le sens de ce qu'on y
     tape (`dir="auto"`).
   - `Adresse de la page publique` (avant : « Identifiant d'URL »), facultative : `Elle est proposée
à partir du nom, et vous pouvez la modifier. Si vous la laissez vide, elle est formée à partir du
nom.`, la règle `Lettres minuscules sans accent ni cédille, chiffres et traits d'union.` avec
     `Exemple : association-horizon`, `Adresse complète :` qui suit la frappe, et
     `Choisissez-la avec soin : elle ne se change plus ensuite.`
   - `Fuseau horaire` : une liste (avant : un texte libre), `Europe/Zurich` choisi d'avance, le
     groupe `Europe` en tête puis `Reste du monde`, des noms canoniques seulement, sans alias ni
     `Etc/`. Aide : `Il sert à afficher les heures du programme à l'heure du lieu de l'organisation
et à calculer les heures de prière. En Suisse : Europe/Zurich.`, puis, pour une ville absente de la
     liste parce que son nom est un alias (Oslo, Stockholm, Amsterdam…) : `Si la ville de
l'organisation n'est pas dans la liste, choisissez une ville qui a toujours la même heure qu'elle.
Pour la plus grande partie de l'Europe : Europe/Zurich, Europe/Paris ou Europe/Berlin.`
   - Le bouton `Créer l'organisation`.

   Après la création : `L'organisation est créée :` et son nom, `Sa page publique :` et l'adresse,
   puis `Pour la préparer, entrez dans son espace depuis la liste des organisations, puis invitez sa
personne responsable depuis l'écran Membres.`

4. **Lien de connexion de secours** :
   - `Servez-vous-en quand une personne ne reçoit pas le courriel de connexion, par exemple si
l'envoi des courriels est en panne.`
   - `Le lien s'affiche ici au lieu de partir par courriel : envoyez-le à la personne par un
message, et, en l'ouvrant, elle entre dans son compte comme avec le lien habituel.`
   - `Il est valable quinze minutes et ne sert qu'une fois.`
   - `Adresse électronique de la personne`, avec `L'adresse de son compte. Exemple :
prenom.nom@exemple.ch`, et le bouton `Créer le lien de connexion`.
   - Le résultat : `Lien de connexion pour <adresse>`, le lien à copier, puis `Il ouvre son compte et
ses organisations, sans aucun pouvoir de super-admin, même pour votre propre adresse. Si l'adresse
n'a pas encore de compte, il en crée un, rattaché à aucune organisation.` et `Ce lien est noté dans
le registre des accès du super-admin.`

Les erreurs sont dites dans la langue de l'écran : nom manquant, adresse refusée avec la règle et un
exemple, nom qui ne permet pas de proposer d'adresse, `Cette adresse est déjà celle d'une autre
organisation. Choisissez-en une autre, par exemple en y ajoutant le nom de la ville.` (avant : une
erreur 500), `Choisissez le fuseau horaire dans la liste.`, `Cette organisation n'existe pas, ou
plus.`

## La passkey, `/super-admin/passkey`

1. Titre `Votre passkey`, puis ce qu'est une passkey : `Une passkey est une clé de connexion que
votre appareil garde pour vous : un téléphone, un ordinateur ou une clé de sécurité. Vous la
déverrouillez comme votre appareil, avec votre empreinte, votre visage ou son code.`
2. Pourquoi elle est exigée : `Pour agir comme super-admin, il faut vous connecter avec une passkey.
Le lien reçu par courriel ne suffit pas : quelqu'un qui entrerait dans votre messagerie ne doit pas
pouvoir ouvrir toutes les organisations.`
3. L'état de la session, l'un des trois : `Vous êtes connecté avec une passkey : vos pouvoirs de
super-admin sont actifs.`, `Aucune passkey n'est encore enregistrée. Enregistrez-en une maintenant,
depuis cette session. […]`, ou `Vous êtes connecté avec le lien reçu par courriel : cette session
n'a aucun pouvoir de super-admin. Connectez-vous avec une passkey déjà enregistrée.`
4. Les boutons `Enregistrer une passkey` et `Se connecter avec une passkey`. Cet écran a besoin de
   JavaScript, et le dit quand il manque : c'est le navigateur qui crée une passkey.
5. **Passkeys enregistrées** : chacune avec son nom et `Enregistrée le 06.03.2026`, le jour en
   Suisse ; avant l'étape 18, la date s'écrivait comme la base l'écrit, et une passkey enregistrée à
   minuit et demi portait la veille. Une passkey enregistrée depuis cet écran s'appelle d'après le
   système de l'appareil et le jour, `Windows, 26.09.2026`, et `(2)` s'ajoute à un second nom
   pareil : deux passkeys de la liste ne portent jamais le même nom. Celles d'avant gardent leur
   nom, `Cet appareil` ; sans nom, `Sans nom`. Sans passkey : `Aucune pour le moment.`
6. Après l'enregistrement : `Passkey enregistrée. Utilisez le bouton ci-dessous pour vous connecter
avec elle, sans quitter la page.` pour la première, et, pouvoirs actifs, `Passkey enregistrée.
Vous pourrez vous connecter avec elle la prochaine fois. Vous n'avez rien d'autre à faire.` pour
   une autre, où aucun bouton n'apparaît puisque la session a déjà ses pouvoirs.
7. Le conseil : `Enregistrez-en plusieurs, sur plusieurs appareils : perdre son téléphone ne doit
pas fermer le service. […]`

Un échec dit ce qui arrive dans la langue de l'écran, puis `Détail donné par le navigateur :`.

## Ce qui reste à reprendre

Relevé par la relecture de l'étape 18, non corrigé à la fin de l'étape : sans JavaScript,
l'adresse proposée à partir du nom est créée sans avoir été vue, et elle ne se change plus. La
proposition perd aussi les ligatures, et un nom en arabe suivi d'un chiffre donne `/m/2`.
