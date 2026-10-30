# La demande d'accès, `/demande-d-acces`

Décrit après le code, à l'étape 22 (ADR 0049). Textes : `apps/web/src/lib/i18n/access-request.ts`,
dans les cinq langues ; l'arabe se lit de droite à gauche. Cette description cite le français.

La page est ouverte à tous, connecté ou non : une organisation la remplit avant d'avoir un compte,
et un compte sans organisation y arrive depuis « Vos organisations ». Elle porte la coquille de
l'espace, le choix de la langue et le pied commun avec `Conditions d'utilisation`.
Sans JavaScript comme avec : un formulaire, une action, une réponse.

On y arrive par trois liens : sous `/connexion`, sur « Vos organisations » quand le compte n'a
aucune organisation, et dans le courriel « aucun compte » (`responsables-coquille.md`).

## Le formulaire

1. Titre de niveau 1 : `Demander l'accès à jadwal`.
2. `jadwal est gratuit pour les organisations qui veulent publier le programme de leurs cours et de
leurs activités. L'accès s'ouvre sur demande : remplissez ce formulaire, et la personne qui
exploite le service l'examinera.`
3. `Si votre demande est acceptée, une invitation arrivera à l'adresse que vous donnez. Elle ouvre
l'espace de votre organisation, où vous gérez son programme.`
4. `Votre organisation utilise déjà jadwal ? Ne remplissez pas ce formulaire : demandez à sa
personne responsable de vous inviter.`
5. Les champs, chacun avec son libellé, puis son aide, que les lecteurs d'écran lisent avec lui :
   - `Nom de l'organisation`, `Exemple : Association culturelle de Bienne` ;
   - `Localité`, `La ville ou la commune de l'organisation. Exemple : Bienne` ;
   - `Votre nom`, `Prénom et nom de la personne qui fait la demande.` ;
   - `Votre adresse électronique`, `L'invitation partira à cette adresse. Exemple :
prenom.nom@example.org`, écrite de gauche à droite même en arabe ;
   - `Message (facultatif)`, sur cinq lignes, `Ce que vous voulez ajouter : vos activités, une
question. 1000 signes au plus.`

   Les quatre premiers sont obligatoires, 120 signes au plus ; l'adresse, 254. Les bornes sont
   celles de la table, posées en `maxlength`. Chaque champ dit au navigateur ce qu'il porte
   (`organization`, `address-level2`, `name`, `email`).

6. **Ce que deviennent ces données**, en titre de niveau 2 : `Elles servent seulement à examiner
votre demande, et seule la personne qui exploite le service les lit. Ce formulaire n'écrit pas à
l'adresse donnée : un courriel n'y part que si la demande est acceptée, et c'est l'invitation. Une
demande est effacée 90 jours après la réponse, ou au bout de 12 mois si elle reste sans réponse.`,
   puis `Le détail est dans les` et le lien `Conditions d'utilisation`.
7. Le bouton `Envoyer la demande`.

## Les réponses

**La demande est partie** : le formulaire disparaît, et la page dit `Votre demande est
enregistrée.` (annoncé, `role="status"`), `Si elle est acceptée, une invitation arrivera à l'adresse
que vous avez donnée. Il n'y a rien d'autre à faire.` et `Vous pouvez fermer cette page.` C'est la
même page, mot pour mot, quand une demande attendait déjà pour cette adresse : rien n'est écrit,
et l'écran ne le dit pas (ADR 0017). Aucun courriel ne part à l'adresse saisie.

**Une saisie refusée** revient avec ce qui a été tapé, en `400`. En haut, annoncé
(`role="alert"`) : `La demande n'est pas partie. Corrigez les champs signalés, puis envoyez-la de
nouveau.` Sous chaque champ fautif, son erreur, reliée au champ (`aria-invalid`,
`aria-describedby`) : `Ce champ est obligatoire.`, `Ce texte est trop long. Raccourcissez-le.` ou,
pour l'adresse, `Cette adresse n'a pas la forme d'une adresse électronique. Exemple :
prenom.nom@example.org`. Rien n'est consommé du budget de l'adresse IP.

**Trop de demandes** : trois demandes par heure depuis la même adresse IP, ou trente pour tout le
service en vingt-quatre heures. La page revient en `429` avec ce qui a été tapé et, en haut :
`Trop de demandes ont été envoyées ces dernières heures. Votre demande n'est pas partie : réessayez
plus tard, par exemple demain.` La phrase est la même pour les deux limites : elle ne dit rien de
personne.

## Ce que la page ne fait pas

- Elle ne crée ni compte ni session, et ne pose aucun cookie de plus que la langue choisie.
- Elle n'écrit à personne, sauf, si l'instance le demande (`JADWAL_DEMANDES_COURRIEL`), un avis à
  l'exploitant qui ne porte rien de la demande : `jadwal : une demande d'accès attend`, `Une
nouvelle demande d'accès attend une réponse dans la console :`, le lien de la console, et `Ce
message ne contient rien de la demande : elle se lit dans la console, et nulle part ailleurs.`
- Elle ne montre pas où en est une demande. La réponse arrive par l'invitation, ou n'arrive pas.
