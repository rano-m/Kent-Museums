const map = L.map('map').setView([39.303537581994675, -75.80184465895468], 13);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let museumsData = [];
let startCoords = null;
let endCoords = null;

// References to dropdowns and "Get Directions" button
const startLocationDropdown = document.getElementById('startLocationDropdown');
const endLocationDropdown = document.getElementById('endLocationDropdown');
const getDirectionsBtn = document.getElementById('getDirectionsBtn');
getDirectionsBtn.disabled = true; // Disable button until data is ready

// Function to load museums data and initialize
async function initializeApp() {
  try {
    const response = await fetch('museums.json');
    if (!response.ok) throw new Error("Failed to load museum data");

    museumsData = await response.json();
    if (museumsData.length === 0) throw new Error("No museum data available");

    populateDropdowns();
    createMarkers();
    setDefaultLocation();
    getDirectionsBtn.disabled = false; // Enable button when data is ready
  } catch (error) {
    console.error("Error initializing app:", error);
  }
}

// Populate dropdown options for start and end locations
function populateDropdowns() {
  startLocationDropdown.innerHTML = `<option value="current">Current Location</option>`;
  endLocationDropdown.innerHTML = `<option value="current">Current Location</option>`;

  museumsData.forEach((museum, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.text = museum.name;
    startLocationDropdown.appendChild(option.cloneNode(true));
    endLocationDropdown.appendChild(option);
  });
}

// Create markers on the map for each museum
function createMarkers() {
  museumsData.forEach((museum, index) => {
    L.marker([museum.lat, museum.lng], {
      icon: L.divIcon({
        className: 'museum-marker',
        html: `${index + 1}`,
        iconSize: [28, 28],
        className: 'museum-marker'
      })
    }).addTo(map)
      .bindPopup(`<b>${museum.name}</b><br>${museum.address}`)
      .bindTooltip(museum.name, { permanent: false, direction: 'top', className: 'museum-label' });
  });
}

// Set default location based on current location or fallback to first museum
function setDefaultLocation() {
  navigator.geolocation.getCurrentPosition(
    position => {
      startCoords = [position.coords.longitude, position.coords.latitude];
      endCoords = startCoords; // Default end location to same as start
      console.log("Using current location as start and end.");
    },
    error => {
      console.error("Location permission denied, using fallback.");
      if (museumsData.length > 0) {
        startCoords = [museumsData[0].lng, museumsData[0].lat];
        endCoords = startCoords;
        startLocationDropdown.value = 0;
        endLocationDropdown.value = 0;
        console.log("Fallback to first museum as start and end.");
      }
    }
  );
}

// Function to set coordinates based on dropdown selection
function setCoordsFromDropdown(dropdown, coordsSetter) {
  const value = dropdown.value;
  if (value === "current" && startCoords) {
    coordsSetter(startCoords);
  } else if (museumsData.length > 0 && value) {
    const selectedMuseum = museumsData[value];
    coordsSetter([selectedMuseum.lng, selectedMuseum.lat]); // OSRM expects [longitude, latitude]
  }
}

// Get directions button handler
getDirectionsBtn.addEventListener('click', () => {
  setCoordsFromDropdown(startLocationDropdown, coords => startCoords = coords);
  setCoordsFromDropdown(endLocationDropdown, coords => endCoords = coords);

  if (!startCoords || !endCoords) {
    alert("Please select valid start and end locations.");
    return;
  }

  calculateRoute();
});

// Calculate and display the route
function calculateRoute() {
  const coordinates = [startCoords, ...museumsData.map(m => [m.lng, m.lat]), endCoords];
  const coordsString = coordinates.map(c => c.join(",")).join(";");

  fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`)
    .then(response => {
      if (!response.ok) throw new Error("Failed to fetch route");
      return response.json();
    })
    .then(data => {
      const route = data.routes[0].geometry;
      L.geoJSON(route).addTo(map);

      // Clear existing markers before re-adding them in optimal order
      map.eachLayer(layer => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
      });

      data.waypoints.slice(1, -1).forEach((waypoint, index) => {
        const museum = museumsData[waypoint.waypoint_index - 1];
        if (museum) {
          L.marker([museum.lat, museum.lng], {
            icon: L.divIcon({
              className: 'museum-marker',
              html: `${index + 1}`,
              iconSize: [28, 28]
            })
          }).bindTooltip(museum.name, { permanent: true, direction: 'top', className: 'museum-label' }).addTo(map);
        }
      });

      const directions = data.routes[0].legs.flatMap(leg => leg.steps.map(step => `<li>${step.maneuver.instruction}</li>`)).join("");
      document.getElementById('directions').innerHTML = `<ul>${directions}</ul>`;
    })
    .catch(error => console.error("Error fetching route:", error));
}

// Start the application
initializeApp();


console.log("Start coordinates:", startCoords);
console.log("End coordinates:", endCoords);
console.log("Museum data:", museumsData);
