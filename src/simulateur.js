// simulateur.js
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost');

// Définition des types de feux et de leurs états possibles
const typeStates = {
  "Tricolore": {
    count: 3, // états 0, 1, 2
    states: {
      0: { label: "Rouge", color: "#ef4444" },
      1: { label: "Orange", color: "#f59e0b" },
      2: { label: "Vert", color: "#22c55e" }
    }
  },
  "Piéton + Cligno": {
    count: 4, // états 0, 1, 2, 3
    states: {
      0: { label: "Éteint", color: "#6b7280" },
      1: { label: "Jaune Cligno", color: "#fbbf24" },
      2: { label: "Rouge Piéton", color: "#ef4444" },
      3: { label: "Vert Piéton", color: "#22c55e" }
    }
  },
  "Transport en commun": {
    count: 2, // états 0, 1
    states: {
      0: { label: "Stop", color: "#ef4444" },
      1: { label: "Go", color: "#22c55e" }
    }
  }
};

// Quelques listes pour générer des données aléatoires
const companies = ["CompanyA", "CompanyB", "CompanyC"];
const paysList = ["FR", "BE", "DE"];
const tensions = ["12V DC", "24V DC", "230V AC"];
const modes = ["Fixe", "Clignotant", "Alterné"];
const optiques = ["OK", "NOK"];

// Fonctions utilitaires
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomChoice(arr) {
  return arr[getRandomInt(0, arr.length - 1)];
}

// Fonction qui génère un tableau de feux aléatoires
function generateRandomFeux(count) {
  const feux = [];
  const centerLat = 44.8378;
  const centerLng = -0.5792;
  
  // Décider aléatoirement quel feu aura une anomalie (si une anomalie est générée)
  const shouldGenerateAnomaly = Math.random() < (1/300); // Une chance sur 300
  const anomalyFeuIndex = shouldGenerateAnomaly ? Math.floor(Math.random() * count) : -1;
  
  for (let i = 0; i < count; i++) {
    // Choix aléatoire du type
    const type = getRandomChoice(Object.keys(typeStates));
    const stateCount = typeStates[type].count;
    
    // Par défaut, tous les paramètres sont normaux
    let tension_service = getRandomChoice(tensions);
    let autonomie = getRandomInt(5, 30) + "h";
    let optiqueHaut = "OK";
    let optiqueCentre = "OK";
    let optiqueBas = "OK";
    
    // Configurer le propriétaire
    const isCompanyAForced = i === anomalyFeuIndex; // Si ce feu doit avoir une anomalie, on le force à être de CompanyA
    const owner = isCompanyAForced ? "CompanyA" : getRandomChoice(companies);
    
    // ANOMALIE: Si ce feu est choisi pour avoir une anomalie
    if (i === anomalyFeuIndex) {
      // Créer une anomalie - optique défectueuse
      optiqueCentre = "NOK";
      
      // Créer une seconde anomalie - autonomie faible
      autonomie = "3h";
      
      // Créer une troisième anomalie - tension anormale
      tension_service = "5V DC";
      
      console.log("*** ANOMALIE CRÉÉE POUR LE FEU DE COMPANY A (FeuRand" + String(i + 1).padStart(3, "0") + ") ***");
    }
    
    const feu = {
      id: "FeuRand" + String(i + 1).padStart(3, "0"),
      nom: "Feu Aléatoire #" + (i + 1),
      type: type,
      owner: owner,
      pays: getRandomChoice(paysList),
      tension_service: tension_service,
      tension_alim: getRandomChoice(tensions),
      etat_courant: getRandomInt(0, stateCount - 1),
      cycles_count: getRandomInt(0, 100),
      // Coordonnées générées autour d'un centre
      latitude: centerLat + (Math.random() - 0.5) * 0.1,
      longitude: centerLng + (Math.random() - 0.5) * 0.1,
      serie: "C" + getRandomInt(1000, 9999),
      tempsFonction: getRandomInt(50, 200) + "h",
      autonomie: autonomie,
      mode: getRandomChoice(modes),
      tableCycle: getRandomInt(1, 2),
      optiqueHaut: optiqueHaut,
      optiqueCentre: optiqueCentre,
      optiqueBas: optiqueBas,
      posPhysique: "Emplacement " + (i + 1),
      radio: Math.random() < 0.5,
      bluetooth: Math.random() < 0.5,
      // Dernier changement initialisé à l'instant
      dernier_changement: new Date().toISOString()
    };
    feux.push(feu);
  }
  return feux;
}

// Génération de 10 feux aléatoires
let feux = generateRandomFeux(10);

// Objet pour stocker les durées par feu
const feuDurees = {};

// Flag pour indiquer si la simulation automatique est active
let simulationActive = true;

// Lorsque le client MQTT est connecté
client.on('connect', () => {
  console.log("Simulation: Connecté au broker MQTT");
  
  // S'abonner au topic de commande
  client.subscribe("feux/commande", err => {
    if (err) {
      console.error("Erreur d'abonnement au topic de commande:", err);
    } else {
      console.log('Abonné au topic "feux/commande"');
    }
  });

  // Génération initiale des feux (une seule fois)
  feux = generateRandomFeux(10);

  // Envoi initial des états de tous les feux
  feux.forEach(feu => {
    const payload = JSON.stringify(feu);
    client.publish("feux/etat", payload, err => {
      if (err) {
        console.error("Erreur de publication initiale MQTT :", err);
      } else {
        console.log(`État initial publié pour ${feu.id} : état ${feu.etat_courant}`);
      }
    });
  });

  // Envoi des mises à jour toutes les 5 secondes
  setInterval(() => {
    feux.forEach(feu => {
      // Pour chaque feu, décider aléatoirement s'il faut générer un état normal ou anormal
      // La probabilité d'un état anormal est faible (environ 1%)
      const generateAnomalyState = Math.random() < 0.005;
      
      if (generateAnomalyState) {
        // Générer un état anormal
        // Vérifier d'abord si le feu est déjà en état anormal
        const isCurrentlyAbnormal = 
          (feu.tension_service && feu.tension_service.includes('5V')) ||
          (feu.optiqueCentre === "NOK") ||
          (feu.autonomie && parseInt(feu.autonomie) < 5);
        
        if (!isCurrentlyAbnormal) {
          // Créer un état anormal (car actuellement normal)
          console.log(`*** GÉNÉRATION D'UN ÉTAT ANORMAL POUR LE FEU ${feu.id} ***`);
          
          // Choisir aléatoirement un type d'anomalie
          const anomalyType = getRandomInt(1, 3);
          
          switch (anomalyType) {
            case 1:
              // Anomalie de tension
              feu.tension_service = "5V DC";
              break;
            case 2:
              // Anomalie d'optique
              feu.optiqueCentre = "NOK";
              break;
            case 3:
              // Anomalie d'autonomie
              feu.autonomie = getRandomInt(1, 4) + "h";
              break;
          }
          
          // Forcer le propriétaire à CompanyA pour les tests d'alertes
          feu.owner = "CompanyA";
        } else {
          // Remettre à l'état normal (car actuellement anormal)
          console.log(`*** RETOUR À L'ÉTAT NORMAL POUR LE FEU ${feu.id} ***`);
          feu.tension_service = getRandomChoice(tensions);
          feu.optiqueCentre = "OK";
          feu.autonomie = getRandomInt(5, 30) + "h";
        }
      }
      
      // Mise à jour aléatoire de l'état des feux (pas lié aux anomalies)
      if (Math.random() < 0.2) { // 20% de chance de changer d'état
        const type = feu.type;
        const stateCount = typeStates[type].count;
        feu.etat_courant = getRandomInt(0, stateCount - 1);
        feu.dernier_changement = new Date().toISOString();
      }
      
      // Mise à jour d'autres propriétés dynamiques
      if (feu.tempsFonction) {
        const heures = parseInt(feu.tempsFonction) || 0;
        feu.tempsFonction = (heures + 1) + "h";
      }
      
      // Publier la mise à jour
      const payload = JSON.stringify(feu);
      client.publish('feux/etat', payload, (err) => {
        if (err) {
          console.error(`Erreur lors de la publication de l'état du feu ${feu.id}:`, err);
        } else {
          console.log(`État du feu ${feu.id} mis à jour avec succès.`);
        }
      });
    });
  }, 5000); // Intervalle de 5 secondes
}); 

// Traitement des commandes reçues
client.on('message', (topic, message) => {
  if (topic === "feux/commande") {
    try {
      const commande = JSON.parse(message.toString());
      console.log(`Commande reçue pour ${commande.id}:`, commande);
      
      // Trouver le feu correspondant
      const feu = feux.find(f => f.id === commande.id);
      
      if (!feu) {
        console.warn(`Feu ${commande.id} non trouvé dans le simulateur`);
        
        // Envoyer une confirmation d'erreur
        const erreur = {
          id: commande.id,
          commande_id: commande.commande_id || null,
          statut: "erreur",
          message: "Feu non trouvé",
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/erreur", JSON.stringify(erreur));
        return;
      }
      
      // Déterminer le type de commande à exécuter
      if (commande.commande === "changerEtat" || commande.action === "changeState") {
        // Support pour les deux formats de commande
        const etatCible = commande.etat_cible !== undefined ? commande.etat_cible : commande.newState;
        
        if (etatCible === undefined) {
          const erreur = {
            id: commande.id,
            commande_id: commande.commande_id || null,
            statut: "erreur",
            message: "État cible non spécifié",
            timestamp: new Date().toISOString()
          };
          client.publish("feux/commande/erreur", JSON.stringify(erreur));
          return;
        }
        
        // Vérifier que l'état demandé est valide
        const stateCount = typeStates[feu.type].count;
        if (etatCible < 0 || etatCible >= stateCount) {
          const erreur = {
            id: commande.id,
            commande_id: commande.commande_id || null,
            statut: "erreur",
            message: `État invalide: ${etatCible}. Doit être entre 0 et ${stateCount-1}`,
            timestamp: new Date().toISOString()
          };
          client.publish("feux/commande/erreur", JSON.stringify(erreur));
          return;
        }
        
        const ancienEtat = feu.etat_courant;
        feu.etat_courant = etatCible;
        feu.dernier_changement = new Date().toISOString();
        
        console.log(`État du feu ${feu.id} changé: ${ancienEtat} -> ${feu.etat_courant}`);
        
        // Publier la mise à jour immédiatement
        const payload = JSON.stringify(feu);
        client.publish("feux/etat", payload);
        
        // Confirmer l'exécution de la commande (format original)
        const confirmation = {
          id: commande.id,
          commande_id: commande.commande_id || null,
          statut: "exécutée",
          etat_cible: etatCible,
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/confirmation", JSON.stringify(confirmation));
        
        // Confirmer aussi au format simplifié pour l'interface améliorée
        const confirmationSimple = {
          id: commande.id,
          oldState: ancienEtat,
          newState: etatCible,
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/confirmation", JSON.stringify(confirmationSimple));
      }
      // Gestion des commandes de changement de durée
      else if (commande.commande === "changerDuree") {
        // Initialiser les durées si nécessaire
        if (!feuDurees[feu.id]) {
          feuDurees[feu.id] = {
            0: 30,  // Rouge
            1: 5,   // Orange
            2: 30   // Vert
          };
        }
        
        // Mettre à jour la durée
        feuDurees[feu.id][commande.etat] = commande.duree;
        
        console.log(`Durée de l'état ${commande.etat} du feu ${feu.id} changée à ${commande.duree}s`);
        
        // Confirmer l'exécution
        const confirmation = {
          id: commande.id,
          statut: "exécutée",
          message: `Durée modifiée à ${commande.duree}s`,
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/confirmation", JSON.stringify(confirmation));
      }
      // Contrôle de la simulation
      else if (commande.commande === "simulation") {
        if (commande.etat_cible === 0) {
          simulationActive = false;
          console.log("Simulation automatique désactivée");
        } else if (commande.etat_cible === 1) {
          simulationActive = true;
          console.log("Simulation automatique activée");
        }
        
        // Confirmer l'exécution de la commande
        const confirmation = {
          id: commande.id,
          commande_id: commande.commande_id || null,
          statut: "exécutée",
          simulation: simulationActive,
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/confirmation", JSON.stringify(confirmation));
      }
      // Commande inconnue
      else {
        console.warn(`Commande inconnue: ${commande.commande || commande.action}`);
        
        const erreur = {
          id: commande.id,
          commande_id: commande.commande_id || null,
          statut: "erreur",
          message: `Type de commande non reconnu: ${commande.commande || commande.action}`,
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/erreur", JSON.stringify(erreur));
      }
    } catch (error) {
      console.error("Erreur lors du traitement de la commande:", error);
      
      // Tenter d'envoyer une erreur générique
      try {
        const erreur = {
          statut: "erreur",
          message: "Format de commande invalide: " + error.message,
          timestamp: new Date().toISOString()
        };
        client.publish("feux/commande/erreur", JSON.stringify(erreur));
      } catch (e) {
        console.error("Impossible d'envoyer l'erreur:", e);
      }
    }
  }
});

// Gestion des erreurs MQTT
client.on('error', (error) => {
  console.error("Erreur MQTT :", error);
});

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
  console.log("Arrêt du simulateur...");
  client.end(() => {
    console.log("Déconnexion du broker MQTT");
    process.exit(0);
  });
});
