# Fiche Play Store — MigraineLog (prêt à copier-coller)

Éditeur : **XYVEL** · Compte : gladia92soussa@gmail.com · ID 6855709067766531973
Fichier à uploader : **MigraineLog.aab** (sur le Bureau)

---

## 1. Identité de l'app
- **Nom de l'app** (30 max) : `MigraineLog`
- **Catégorie** : Santé et remise en forme
- **Type** : Application (gratuite)
- **Tags** : migraine, céphalées, santé, journal, suivi

## 2. Description courte (80 caractères max)
```
Journal de migraines privé : suivez vos crises et aidez votre médecin.
```

## 3. Description complète (4000 max)
```
MigraineLog — votre journal de migraines, simple et privé.

MigraineLog vous aide à suivre vos crises au quotidien et à préparer efficacement vos consultations. Notez en quelques secondes l'intensité, la durée, les symptômes et les médicaments pris, puis obtenez des synthèses claires à montrer à votre médecin.

CE QUE VOUS POUVEZ FAIRE
• Grille jour par jour : intensité (1–10), durée, uni/bilatéral, symptômes (aura, nausées, photophobie…), médicaments.
• Suivi précis des prises de médicaments, y compris une 2ᵉ prise (utile pour les triptans).
• Synthèses mensuelles et vue annuelle pour visualiser la fréquence et les tendances.
• Profil patient (âge, sexe, antécédents, traitement de fond) pour un suivi adapté.
• Export PDF à apporter en consultation.
• Analyse médicale par IA 100 % locale (sur ordinateur), sans aucun envoi de données.

VOS DONNÉES VOUS APPARTIENNENT
• Aucune donnée hébergée sur nos serveurs.
• Synchronisation entre vos appareils via VOTRE Google Drive privé (optionnelle).
• Aucune publicité, aucun traceur, aucune revente de données.

POUR QUI ?
Toute personne sujette aux migraines ou aux maux de tête qui souhaite mieux comprendre ses crises et dialoguer avec son médecin sur des données fiables.

MigraineLog n'est pas un dispositif médical et ne fournit pas de diagnostic. C'est un outil de suivi personnel destiné à accompagner votre relation avec un professionnel de santé.
```

## 4. Coordonnées (App content / Store listing)
- **E-mail** : gladia92soussa@gmail.com
- **Site web** : https://gladia92.github.io/migrainelog/
- **Politique de confidentialité** : https://gladia92.github.io/migrainelog/privacy.html

## 5. Visuels requis
- **Icône** 512×512 : `icon.png` ✅ (déjà au format)
- **Image mise en avant (feature graphic)** 1024×500 : `assets/feature-graphic.png` (générée — voir Bureau)
- **Captures d'écran téléphone** (2 à 8, format portrait) — à prendre sur le tél :
  1. Onglet **Grille** (une crise saisie)
  2. Onglet **Synthèse** (les cartes de stats)
  3. Onglet **Annuel** (la grille de l'année)
  4. **Paramètres** (profil patient + médicaments)
  5. **Synchronisation** (compte connecté) — optionnel

## 6. Classification du contenu (questionnaire)
- Type d'app : Utilitaire / Santé (pas un jeu).
- Violence / sexe / drogue / grossièretés / jeux d'argent : **Non** à tout.
- → Résultat attendu : **Tout public** (PEGI 3).

## 7. Sécurité des données (Data safety) — réponses recommandées
**L'app collecte/transmet-elle des données ?** Oui (pour fonctionner), mais **rien n'est reçu par le développeur** ni partagé avec des tiers.

Types de données à déclarer :
- **Informations de santé** (le journal de migraines) :
  - Collectée : Oui · Partagée : **Non**
  - Finalité : **Fonctionnalité de l'application**
  - Chiffrée en transit : **Oui** (HTTPS vers le Drive de l'utilisateur)
  - L'utilisateur peut demander la suppression : **Oui**
  - Obligatoire : Oui (cœur de l'app)
- **Adresse e-mail** (uniquement si connexion Google pour la sync) :
  - Collectée : Oui · Partagée : **Non**
  - Finalité : Fonctionnalité (identification pour la synchronisation)
  - Chiffrée en transit : Oui · Suppression possible : Oui

Points clés à cocher : **pas de partage à des tiers**, **pas de publicité**, données **chiffrées en transit**, **suppression** possible (désinstallation / déconnexion).

## 8. Déclaration « App santé » (App content)
- L'app gère des données de santé saisies par l'utilisateur.
- **N'est pas** un dispositif médical, **ne fournit pas** de diagnostic ni de conseil médical.
- Pas de fonctionnalités cliniques régulées (pas de télémédecine, pas de mesures).

## 9. Pays / Diffusion
- Disponibilité : tous pays (ou France d'abord, au choix).
- Contient des annonces : **Non**.
- Achats intégrés : **Non**.

---

### Rappels techniques avant publication
- Pour chaque mise à jour, incrémenter `versionCode` dans android/app/build.gradle (actuellement 1) et rebuild le .aab.
- La sync Drive pour le grand public nécessitera la **validation OAuth Google** (écran de consentement) — séparée du Play Store, à lancer en parallèle.

---

## 10. Refus Play Store — compte développeur « Organisation » requis (2026-06-11)

Google a **rejeté la publication** de MigraineLog avec le motif « Violation of Play
Console Requirements policy » :

> Some types of apps can only be distributed by organizations. [...] Health apps,
> such as medical apps and human subjects research apps [...] must register as
> an organization.

**Constat** : MigraineLog gère un journal de données de santé (migraines, symptômes,
médicaments), donc il est classé « Health app » au sens de la politique Google
(en vigueur depuis le 31/08/2024). Ce n'est **pas un bug du code** — c'est le type
de compte développeur (« individuel ») qui n'est plus autorisé pour cette catégorie.

⚠️ Modifier la catégorie/déclaration « App santé » pour échapper à cette règle
**n'est pas recommandé** : l'app collecte bien des données de santé, une
déclaration inexacte exposerait à d'autres violations (Data safety, Health apps
policy) et à un bannissement plus sérieux.

### Étapes pour résoudre (côté Play Console, hors code)
1. Dans Play Console → **Paramètres → Compte développeur**, lancer la
   **transformation du compte individuel en compte « Organisation »**.
2. Préparer les documents requis pour un compte Organisation :
   - Numéro **D-U-N-S** (Dun & Bradstreet) pour l'entité légale (XYVEL ou nom
     d'exploitation utilisé) — gratuit, demande via le site Dun & Bradstreet.
   - Justificatif légal de l'entité (immatriculation, etc.).
3. Une fois le compte basculé et vérifié, retourner sur la page **Présentation
   de la publication** et renvoyer la version pour examen (« Send for review »).
4. Si vous estimez la classification « Health app » incorrecte pour MigraineLog,
   il est possible de **soumettre un appel** depuis Play Console — mais vu la
   description de l'app (suivi de crises, médicaments, synthèses pour le médecin),
   un appel a peu de chances d'aboutir.

### Alternative (si pas d'entité légale disponible)
- Un développeur individuel peut s'enregistrer comme **« Organisation /
  Sole proprietorship » (entreprise individuelle / auto-entrepreneur)** dans
  certains pays sans D-U-N-S préexistant — Play Console guide vers la création
  d'un numéro D-U-N-S pendant le processus si besoin.
