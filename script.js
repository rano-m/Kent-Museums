const map = L.map('map').setView([39.224308372070155, -76.06278080179688], 13);
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

// Helper function to calculate the Haversine distance between two points
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
  
  // Define `visitOrder` globally if needed for other functions
let visitOrder = [];

function calculateRoute() {
    // Clear only the route layer without touching the initial markers
    routeLayer.clearLayers();
    visitSequenceContainer.innerHTML = "<h4>Visit Sequence</h4><ul>"; // Clear visit sequence
  
    // Calculate distances from current location to each museum and sort by proximity
    const currentLocation = { lat: startCoords[1], lng: startCoords[0] };
    const museumsByProximity = museumsData.map(museum => {
      const distance = calculateDistance(currentLocation.lat, currentLocation.lng, museum.lat, museum.lng);
      return { ...museum, distance };
    }).sort((a, b) => a.distance - b.distance);
  
    // Update visit sequence sidebar with the correct order based on real-world proximity
    museumsByProximity.forEach((museum, index) => {
      const listItem = document.createElement('li');
      listItem.innerHTML = `<b>${index + 1}. ${museum.name}</b><br>Distance: ${(museum.distance / 1000).toFixed(2)} km<br>Hours: ${museum.hours || 'Not available'}`;
      visitSequenceContainer.querySelector("ul").appendChild(listItem);
    });
  
    // Store sorted museums in `visitOrder` for later use with Google Maps
    visitOrder = museumsByProximity;
  
    // Update coordinates for OSRM route calculation
    const coordinates = [startCoords, ...museumsByProximity.map(m => [m.lng, m.lat]), endCoords];
    const coordsString = coordinates.map(c => c.join(",")).join(";");
  
    fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`)
      .then(response => {
        if (!response.ok) throw new Error("Failed to fetch route");
        return response.json();
      })
      .then(data => {
        const route = data.routes[0].geometry;
        L.geoJSON(route).addTo(routeLayer);
  
        // Display detailed directions
        const directions = data.routes[0].legs.flatMap(leg => leg.steps.map(step => `<li>${step.maneuver.instruction}</li>`)).join("");
        document.getElementById('directions').innerHTML = `<ul>${directions}</ul>`;
  
        // Show the "Start the Route" button after route calculation is successful
        startRouteButton.style.display = 'block';
      })
      .catch(error => console.error("Error fetching route:", error));
  }
  

  
// Start the application
initializeApp();

// Function to display the welcome modal
function showWelcomeModal() {
    const welcomeModal = document.getElementById('welcomeModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
  
    // Display the modal
    welcomeModal.style.display = 'flex';
  
    // Close the modal when "Get Started" button is clicked
    closeModalBtn.addEventListener('click', () => {
      welcomeModal.style.display = 'none';
    });
  }
  
  // Show the welcome modal when the page loads
  window.addEventListener('load', showWelcomeModal);
  
// Function to generate the Google Maps URL and open it
function openInGoogleMaps() {
    // Define start, end, and waypoints using coordinates
    const start = `${startCoords[1]},${startCoords[0]}`;
    const end = `${endCoords[1]},${endCoords[0]}`;
    
    // Construct waypoints based on the optimized visit order
    const waypoints = visitOrder.map(museum => `${museum.lat},${museum.lng}`).join('|');
    
    // Create the Google Maps directions URL
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${start}&destination=${end}&waypoints=${waypoints}&travelmode=driving`;
  
    // Open the generated URL in a new tab or Google Maps app (on mobile)
    window.open(googleMapsUrl, '_blank');
  }
  
// Create the "Start the Route" button and add it to the sidebar
const startRouteButton = document.createElement('button');
startRouteButton.innerText = 'Start the Route';
startRouteButton.classList.add('start-route-btn');
startRouteButton.style.marginTop = '10px'; // Add some margin for spacing
startRouteButton.style.display = 'none'; // Hide button initially
startRouteButton.addEventListener('click', openInGoogleMaps);

// Append the button to the sidebar, above the Visit Sequence container
document.getElementById('sidebar').insertBefore(startRouteButton, visitSequenceContainer);
