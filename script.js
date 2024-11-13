const map = L.map('map').setView([39.303537581994675, -75.80184465895468], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let museumsData = [];
let startCoords = null;
let endCoords = null;
let routeLayer = L.layerGroup().addTo(map); // Separate layer for route markers

const startLocationDropdown = document.getElementById('startLocationDropdown');
const endLocationDropdown = document.getElementById('endLocationDropdown');
const getDirectionsBtn = document.getElementById('getDirectionsBtn');
getDirectionsBtn.disabled = true;

// Sidebar for the visit sequence
const visitSequenceContainer = document.createElement('div');
visitSequenceContainer.id = 'visitSequence';
document.getElementById('sidebar').appendChild(visitSequenceContainer); // Add to sidebar

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
    getDirectionsBtn.disabled = false;
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
      endCoords = startCoords;
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
    coordsSetter([selectedMuseum.lng, selectedMuseum.lat]);
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

// Helper function to calculate the distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = lat1 * (Math.PI / 180);
    const phi2 = lat2 * (Math.PI / 180);
    const deltaPhi = (lat2 - lat1) * (Math.PI / 180);
    const deltaLambda = (lon2 - lon1) * (Math.PI / 180);
  
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
    return R * c; // Distance in meters
  }
  
  function calculateRoute() {
    // Clear only the route layer without touching the initial markers
    routeLayer.clearLayers();
    visitSequenceContainer.innerHTML = "<h4>Visit Sequence</h4><ul>"; // Clear visit sequence
  
    const coordinates = [startCoords, ...museumsData.map(m => [m.lng, m.lat]), endCoords];
    const coordsString = coordinates.map(c => c.join(",")).join(";");
  
    console.log("Calculating route with coordinates:", coordinates);
    console.log("Coordinates string for OSRM:", coordsString);
  
    fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`)
      .then(response => {
        if (!response.ok) throw new Error("Failed to fetch route");
        return response.json();
      })
      .then(data => {
        const route = data.routes[0].geometry;
        L.geoJSON(route).addTo(routeLayer);
  
        console.log("OSRM Route Data:", data);
        console.log("OSRM Waypoints:", data.waypoints);
  
        // Display the visit sequence in the correct order
        const visitOrder = [];
  
        data.waypoints.forEach((waypoint, index) => {
          console.log(`Processing waypoint ${index}:`, waypoint);
  
          // Skip start and end waypoints
          if (index === 0 || index === data.waypoints.length - 1) {
            return;
          }
  
          // Find the closest museum to the current waypoint based on distance
          let closestMuseum = null;
          let closestDistance = Infinity;
  
          museumsData.forEach(museum => {
            const distance = calculateDistance(
              museum.lat, museum.lng,
              waypoint.location[1], waypoint.location[0]
            );
  
            if (distance < closestDistance && distance < 100) { // Use a 100-meter threshold
              closestMuseum = museum;
              closestDistance = distance;
            }
          });
  
          if (closestMuseum) {
            visitOrder.push(closestMuseum);
  
            // Add route markers with correct numbering in visit order
            L.marker([closestMuseum.lat, closestMuseum.lng], {
              icon: L.divIcon({
                className: 'museum-marker',
                html: `${visitOrder.length}`, // Show the correct visit order number
                iconSize: [28, 28]
              })
            }).bindTooltip(closestMuseum.name, { permanent: true, direction: 'top', className: 'museum-label' }).addTo(routeLayer);
  
            console.log(`Added museum to route: ${closestMuseum.name} (Distance: ${closestDistance.toFixed(2)} meters)`);
          } else {
            console.error("No matching museum found within range for waypoint:", waypoint);
          }
        });
  
        // Populate visit sequence sidebar
        visitOrder.forEach((museum, index) => {
          const listItem = document.createElement('li');
          listItem.innerHTML = `<b>${index + 1}. ${museum.name}</b><br>Hours: ${museum.hours || 'Not available'}`;
          visitSequenceContainer.querySelector("ul").appendChild(listItem);
        });
  
        visitSequenceContainer.innerHTML += "</ul>"; // Close the list
        const directions = data.routes[0].legs.flatMap(leg => leg.steps.map(step => `<li>${step.maneuver.instruction}</li>`)).join("");
        document.getElementById('directions').innerHTML = `<ul>${directions}</ul>`;
      })
      .catch(error => console.error("Error fetching route:", error));
  }
  
  

// Start the application
initializeApp();
