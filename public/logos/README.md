# Logos des entités

Déposez ici un PNG par entité, nommé d'après le **code** de l'entité en base :

```
logo-pro.png     → entité de code PRO
logo-ext.png     → entité de code EXT
logo-int.png     → entité de code INT
```

Ces fichiers sont chargés par `src/routes/devis.$id.tsx` puis intégrés en haut à droite
de la page de garde du devis PDF.

**Format conseillé** : PNG à fond transparent, environ 600 px de large. Le générateur
redimensionne automatiquement dans une boîte de 60 × 30 mm en conservant les proportions.

Si un logo est absent, le PDF se génère quand même — simplement sans logo. Aucune erreur
n'est levée. Si vous renommez vos entités, mettez à jour la table `LOGOS` en tête de
`src/routes/devis.$id.tsx`.
