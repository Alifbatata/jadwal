# La console du super-admin et l'écran de la passkey

Décrit après le code, à l'étape 18 (retour B2, et B1, D2, A3 pour ces écrans), et repris à
l'étape 22 : les demandes d'accès, et l'invitation de la personne responsable depuis la console
(ADR 0049). Textes : `apps/web/src/lib/i18n/super-admin.ts` et `super-admin-passkey.ts`, dans les
cinq langues. Les pouvoirs du super-admin sont dans l'ADR 0025.

## La console, `/super-admin`

Réservée à l'exploitant, avec les pouvoirs d'une passkey ; sans eux, l'écran de la passkey.

1. Titre de niveau 1 : `Super-admin`, puis `Cet écran sert à la personne qui exploite le service :
créer les organisations et inviter leur personne responsable, régler leur état, entrer dans leur
espace pour les aider, et dépanner une connexion.`
2. **Demandes d'accès** (étape 22), en tête de la console : `Les organisations qui veulent utiliser
jadwal le demandent par le formulaire du site. Chaque demande attend ici votre réponse.` Sans
   demande : `Aucune demande en attente.` Sinon, une fois au-dessus de la liste : `Remplit le
formulaire de création avec ce que dit la demande. La demande est acceptée quand l'organisation
est créée, et l'invitation part à la personne qui a demandé.`

   Chaque demande en attente, de la plus ancienne à la plus récente : le nom de l'organisation,
   puis `Localité :`, `Personne qui demande :`, `Adresse électronique :`, `Langue de la demande :`
   (le nom de la langue, écrit dans cette langue), `Reçue le` et le jour, `30.10.2026`, jour de la
   Suisse, et `Message :` s'il y en a un, ses retours à la ligne gardés. Tout ce que la demande a
   écrit est isolé dans un `<bdi>` : un nom arabe ne retourne pas la ligne. Puis :
   - le lien `Créer l'organisation`, qui mène au formulaire de création, plus bas, rempli par la
     demande (point 4) ;
   - l'élément replié `Refuser cette demande` : `Aucun courriel ne part : la personne n'est pas
prévenue. Une demande refusée est effacée au bout de 90 jours.` et le bouton
     `Refuser la demande`. Après : `Demande refusée :` et le nom de l'organisation, puis
     `Aucun courriel n'est parti.`

   Une demande qui n'attend plus (déjà acceptée ou refusée, dans un autre onglet, ou effacée) :
   `Cette demande n'attend plus de réponse : elle a déjà été acceptée ou refusée, ou elle a été
effacée.`, en haut, et rien n'est fait.

3. **Organisations**, avec, une seule fois au-dessus de la liste, ce que fait chaque geste :
   - `Entrer dans son espace` : `Vous y voyez et modifiez tout, comme sa personne responsable. Une
bannière le rappelle en haut de chaque écran.`
   - `État` : `Une organisation suspendue n'a plus de page publique : ni sa page, ni son widget, ni
son agenda ne s'affichent. Rien n'est effacé, et vous pouvez la réactiver.`
   - `Inviter une personne responsable` (étape 22) : `L'invitation part par courriel. En
l'acceptant, la personne devient responsable de l'organisation, sans que vous ayez à entrer
dans son espace.`

   Chaque organisation : son nom, `Page publique :` et son adresse complète en lien (avant :
   l'identifiant seul), `Entrer dans son espace`, l'état (`Active`, `Suspendue`) avec
   `Enregistrer l'état` (avant : `Changer`). Après le geste : `État enregistré pour <organisation>.`
   Le plan (`Gratuit`, `Offert`, `Payant`) et son bouton ont disparu à l'étape 22 : jadwal est
   gratuit (ADR 0049).

   Sous chaque organisation, l'élément replié `Inviter une personne responsable` :
   `Adresse électronique de la personne responsable`, avec `Exemple : prenom.nom@example.org` ;
   `Langue du courriel`, la langue de l'écran choisie d'avance, avec `La personne invitée reçoit le
courriel dans cette langue.` ; le bouton `Envoyer l'invitation`. Après l'envoi :
   `L'invitation de personne responsable est partie à :` et l'adresse, `Organisation :` et son nom,
   puis `Elle vaut 14 jours. En l'acceptant, cette personne devient responsable de
l'organisation.` La réponse est la même, mot pour mot, que l'adresse ait un compte ou non
   (ADR 0017). Une adresse refusée rouvre l'élément avec ce qui a été saisi.

   Sans organisation : `Aucune organisation pour le moment. Créez la première avec le formulaire
ci-dessous.`

4. **Créer une organisation** (avant : « Ouvrir une organisation ») : `Une organisation est l'espace
d'une association, d'une école ou d'un club : son programme, ses membres et sa page publique.`

   Arrivé par `Créer l'organisation` sur une demande (`/super-admin?demande=<id>#creer-titre`, un
   lien, sans JavaScript), le formulaire est rempli : le nom, l'adresse proposée à partir du nom
   (dans le champ, et en entier sous lui), l'adresse de la personne qui a demandé et la langue de sa
   demande. Une note le dit au-dessus : `Formulaire rempli à partir de la demande de :` et le nom,
   puis `Vérifiez le nom et l'adresse avant de créer : la demande est marquée acceptée à la
création, et l'invitation part à l'adresse de la personne qui a demandé, dans la langue de sa
demande.` Un lien vers une demande qui n'attend plus le dit (l'erreur du point 2), et le
   formulaire reste vide.

   - `Nom de l'organisation`, avec `Tel qu'il s'affichera sur sa page publique.` et
     `Exemple : Association Horizon` (en arabe, `جمعية الأفق`). Le champ prend le sens de ce qu'on y
     tape (`dir="auto"`).
   - `Adresse de la page publique` (avant : « Identifiant d'URL »), facultative : `Elle est proposée
à partir du nom, et vous pouvez la modifier. Si vous la laissez vide, l'écran la forme à partir
du nom et vous la montre avant de créer l'organisation.`, la règle `Lettres minuscules sans
accent ni cédille, chiffres et traits d'union, avec au moins une lettre.` avec
     `Exemple : association-horizon`, `Adresse complète :` qui suit la frappe, et
     `Choisissez-la avec soin : elle ne se change plus ensuite.` Un nom sans aucune lettre latine
     ne propose rien : sous le champ, `Ce nom n'a aucune lettre latine : aucune adresse ne peut en
être tirée. Écrivez-la vous-même.`, pendant la frappe avec JavaScript, et au retour du
     formulaire sans lui.
   - `Fuseau horaire` : une liste (avant : un texte libre), `Europe/Zurich` choisi d'avance, le
     groupe `Europe` en tête puis `Reste du monde`, des noms canoniques seulement, sans alias ni
     `Etc/`. Aide : `Il sert à afficher les heures du programme à l'heure du lieu de l'organisation
et à calculer les heures de prière. En Suisse : Europe/Zurich.`, puis, pour une ville absente
     de la liste parce que son nom est un alias (Oslo, Stockholm, Amsterdam…) : `Si la ville de
l'organisation n'est pas dans la liste, choisissez une ville qui a toujours la même heure
qu'elle. Pour la plus grande partie de l'Europe : Europe/Zurich, Europe/Paris ou
Europe/Berlin.`
   - Le groupe `Personne responsable (facultatif)` (étape 22) : `Si vous connaissez son adresse
électronique, l'invitation lui part dès la création de l'organisation. Sinon, laissez le champ
vide : vous pourrez l'inviter plus tard depuis la liste des organisations.`, puis les deux
     champs de l'invitation du point 3, l'adresse et la langue du courriel.
   - Le bouton `Créer l'organisation`.

   L'organisation et l'invitation s'écrivent dans une seule transaction ; le courriel part après.
   Depuis une demande, la même transaction marque d'abord la demande acceptée : si elle n'attend
   plus, rien n'est créé, aucun courriel ne part, et le formulaire revient rempli, sans le lien à la
   demande, avec l'erreur du point 2.

   **Sans JavaScript**, le champ de l'adresse part vide, et personne n'a vu l'adresse que le
   serveur en tire : rien n'est créé (étape 19, D6). La page revient avec, en haut, une étape
   `Vérifiez l'adresse avant de créer l'organisation` : `L'organisation n'est pas encore créée :` et
   son nom, `Adresse de sa page publique, proposée à partir du nom :` et l'adresse entière, si une
   personne responsable est donnée `L'invitation de personne responsable partira à la création,
à :` et son adresse, puis `Elle ne se changera plus ensuite. Si elle vous convient, touchez
« Créer l'organisation ». Sinon, écrivez-en une autre dans le champ ci-dessous.` Le champ
   `Adresse de la page publique` porte l'adresse proposée, obligatoire et vérifié par le navigateur,
   avec la règle ; le nom, le fuseau, la personne responsable, la langue du courriel et la demande
   repartent tels quels, et le formulaire de création, plus bas, les garde aussi. Une adresse
   proposée déjà prise est dite tout de suite, par l'erreur habituelle, et revient dans le champ.

   Après la création : `L'organisation est créée :` et son nom, `Sa page publique :` et l'adresse.
   Avec une personne responsable, les phrases de l'invitation du point 3 suivent. Sans elle :
   `Pour y faire entrer sa personne responsable, touchez « Inviter une personne responsable » sous
son nom, dans la liste des organisations.` (jusqu'à l'étape 21 : entrer dans son espace, puis
   l'inviter depuis Membres). Depuis une demande, enfin : `La demande d'accès est marquée
acceptée.`

5. **Lien de connexion de secours** :
   - `Servez-vous-en quand une personne ne reçoit pas le courriel de connexion, par exemple si
l'envoi des courriels est en panne.`
   - `Le lien s'affiche ici au lieu de partir par courriel : envoyez-le à la personne par un
message, et, en l'ouvrant, elle entre dans son compte comme avec le lien habituel.`
   - `Il est valable quinze minutes et ne sert qu'une fois.`
   - `Adresse électronique de la personne`, avec `L'adresse de son compte. Exemple :
prenom.nom@example.org`, et le bouton `Créer le lien de connexion`.
   - Le résultat : `Lien de connexion pour <adresse>`, le lien à copier, puis `Il ouvre son compte et
ses organisations, sans aucun pouvoir de super-admin, même pour votre propre adresse. Si l'adresse
n'a pas encore de compte, il en crée un, rattaché à aucune organisation.` et `Ce lien est noté dans
le registre des accès du super-admin.`

Les erreurs sont dites dans la langue de l'écran : nom manquant, adresse refusée avec la règle et un
exemple, nom qui ne permet pas de proposer d'adresse, `Cette adresse n'a que des chiffres et des
traits d'union. Ajoutez-y au moins une lettre, par exemple un mot du nom.` (depuis l'étape 19 ; la
base refuse aussi `2026` depuis l'étape 20, migration 0074), `Cette adresse est déjà celle d'une
autre organisation. Choisissez-en une autre, par exemple en y ajoutant le nom de la ville.` (avant :
une erreur 500), `Choisissez le fuseau horaire dans la liste.`, `Cette organisation n'existe pas, ou
plus.`, et depuis l'étape 22 `L'adresse de la personne responsable ne convient pas. Exemple :
prenom.nom@example.org` et l'erreur d'une demande qui n'attend plus.

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

## Corrigé à l'étape 19

Relevé par la relecture de l'étape 18 (D6), corrigé à l'étape 19 : sans JavaScript, l'adresse
proposée à partir du nom était créée sans avoir été vue, et elle ne se change plus ; elle passe
désormais par l'étape qui la montre. La proposition décompose les ligatures et les lettres pleine
chasse (`NFKD` au lieu de `NFD`), avant de tout mettre en minuscules, parce qu'elle donne parfois
une majuscule : « Club № 5 » propose `club-no-5`. « ™ » et « ℠ » tombent comme la ponctuation :
« Horizon™ » propose `horizon`. Un nom sans aucune lettre latine, même suivi d'un chiffre, ne
propose plus d'adresse (il donnait `/m/2`) ; une adresse sans aucune lettre est refusée.
