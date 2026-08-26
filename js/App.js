/**
 * app.js
 * -------------------------------------------------------------
 * Logique de l'application SolFinder.
 * Dépend de data-sols.js et geocoding.js (chargés avant ce fichier).
 */

const DISTANCE_ALERTE_KM = 80; // au-delà, on prévient que l'estimation est approximative

document.addEventListener("DOMContentLoaded", () => {
  const inputZone = document.getElementById("input-zone");
  const btnRechercheZone = document.getElementById("btn-recherche-zone");
  const btnGeoloc = document.getElementById("btn-geoloc");
  const chipsDepartements = document.getElementById("chips-departements");
  const zoneResultat = document.getElementById("zone-resultat");
  const zoneEtat = document.getElementById("zone-etat");

  let carte;
  let marqueur;

  initCarte();
  initChips();

  btnRechercheZone.addEventListener("click", rechercherParNom);
  inputZone.addEventListener("keydown", e => {
    if (e.key === "Enter") rechercherParNom();
  });
  btnGeoloc.addEventListener("click", localiserParPosition);

  /**
   * Initialise la carte Leaflet centrée sur le Bénin.
   */
  function initCarte() {
    carte = L.map("carte", { scrollWheelZoom: false }).setView([9.3, 2.3], 6.3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(carte);
  }

  /**
   * Ajoute des raccourcis (puces) pour les départements déjà en base.
   */
  function initChips() {
    SOLS.forEach(sol => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = sol.departement;
      chip.addEventListener("click", () => {
        afficherLieuEtSol(`${sol.departement}, Bénin`, sol.lat, sol.lng, sol, 0);
      });
      chipsDepartements.appendChild(chip);
    });
  }

  /**
   * Recherche une zone à partir du texte saisi par l'utilisateur.
   */
  async function rechercherParNom() {
    const nom = inputZone.value.trim();
    if (!nom) {
      afficherEtat("Tape le nom d'une zone à rechercher (ville, quartier, région…).", "avertissement");
      return;
    }

    afficherEtat("Recherche du lieu…", "chargement");
    try {
      const lieu = await rechercherLieu(nom);
      traiterLocalisation(lieu);
    } catch (erreur) {
      afficherEtat(erreur.message, "erreur");
    }
  }

  /**
   * Utilise la position GPS de l'utilisateur, puis retrouve le nom
   * réel du lieu (géocodage inversé) avant d'afficher le résultat.
   */
  function localiserParPosition() {
    if (!navigator.geolocation) {
      afficherEtat("La géolocalisation n'est pas supportée par ce navigateur.", "erreur");
      return;
    }

    afficherEtat("Localisation en cours…", "chargement");

    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          const lieu = await localiserParCoordonnees(
            position.coords.latitude,
            position.coords.longitude
          );
          traiterLocalisation(lieu);
        } catch (erreur) {
          afficherEtat(erreur.message, "erreur");
        }
      },
      erreur => {
        afficherEtat("Impossible de récupérer ta position : " + erreur.message, "erreur");
      }
    );
  }

  /**
   * À partir d'un lieu (nom + coordonnées), trouve le sol le plus
   * proche dans la base et déclenche l'affichage.
   */
  function traiterLocalisation(lieu) {
    const { sol, distance } = trouverSolLePlusProche(lieu.lat, lieu.lng);
    afficherLieuEtSol(lieu.nom, lieu.lat, lieu.lng, sol, distance);
  }

  /**
   * Trouve l'entrée de la base la plus proche des coordonnées données
   * (distance à vol d'oiseau, formule de Haversine).
   */
  function trouverSolLePlusProche(lat, lng) {
    let plusProche = null;
    let distanceMin = Infinity;

    SOLS.forEach(sol => {
      const distance = distanceKm(lat, lng, sol.lat, sol.lng);
      if (distance < distanceMin) {
        distanceMin = distance;
        plusProche = sol;
      }
    });

    return { sol: plusProche, distance: distanceMin };
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Affiche un message d'état (chargement, erreur, avertissement).
   */
  function afficherEtat(message, type) {
    zoneEtat.textContent = message;
    zoneEtat.className = "etat etat--" + type;
    zoneEtat.hidden = false;
    zoneResultat.hidden = true;
  }

  /**
   * Déplace la carte et pose un marqueur sur le lieu trouvé.
   */
  function deplacerCarte(lat, lng, nomLieu) {
    carte.setView([lat, lng], 11);
    if (marqueur) marqueur.remove();
    marqueur = L.marker([lat, lng]).addTo(carte).bindPopup(nomLieu).openPopup();
  }

  /**
   * Construit et affiche la fiche de résultat pour un lieu + un sol.
   */
  function afficherLieuEtSol(nomLieu, lat, lng, sol, distance) {
    zoneEtat.hidden = true;
    deplacerCarte(lat, lng, nomLieu);

    const horizonsHTML = sol.horizons
      .map(h => `<div class="horizon" style="background:${h.couleur}"><span>${h.nom}</span></div>`)
      .join("");

    const culturesHTML = sol.culturesAdaptees
      .map(c => `<li>${c}</li>`)
      .join("");

    const calendrierHTML = construireCalendrierHTML(sol.zone);

    const noteDistance =
      distance > DISTANCE_ALERTE_KM
        ? `<p class="note-distance">Estimation basée sur la donnée connue la plus proche (${sol.departement}, à ${Math.round(distance)} km). La précision est limitée en dehors des zones couvertes par notre base.</p>`
        : "";

    zoneResultat.innerHTML = `
      <div class="carte-resultat">
        <div class="profil-sol" aria-hidden="true">${horizonsHTML}</div>
        <div class="infos-sol">
          <p class="eyebrow">${nomLieu}</p>
          <h2>${sol.typeSol}</h2>
          <p class="description">${sol.description}</p>
          ${noteDistance}
          <dl class="fiche">
            <div>
              <dt>pH</dt>
              <dd>${sol.ph}</dd>
            </div>
            <div>
              <dt>Fertilité</dt>
              <dd>${sol.fertilite}</dd>
            </div>
          </dl>
          <p class="cultures-titre">Cultures adaptées</p>
          <ul class="cultures">${culturesHTML}</ul>
        </div>
      </div>

      <div class="carte-calendrier">
        <p class="cultures-titre">Calendrier cultural mensuel</p>
        <p class="calendrier-note">Cultures pratiquées (semis, entretien ou récolte) mois par mois pour cette zone.</p>
        <div class="calendrier">${calendrierHTML}</div>
      </div>
    `;
    zoneResultat.hidden = false;
  }

  /**
   * Construit le tableau des 12 mois pour la zone climatique donnée
   * (voir CALENDRIERS_PAR_ZONE dans data-sols.js).
   */
  function construireCalendrierHTML(zone) {
    const calendrier = CALENDRIERS_PAR_ZONE[zone];
    if (!calendrier) return "<p>Calendrier non disponible pour cette zone.</p>";

    return Object.entries(calendrier)
      .map(([mois, cultures]) => {
        const listeCultures = cultures.map(c => `<li>${c}</li>`).join("");
        return `
          <div class="mois-carte">
            <p class="mois-carte__nom">${mois}</p>
            <ul class="mois-carte__cultures">${listeCultures}</ul>
          </div>
        `;
      })
      .join("");
  }
});