const map = L.map('map').setView([39.224308372070155, -76.06278080179688], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let museumsData = [];
let startCoords = null;
let endCoords = null;
let routeLayer = L.layerGroup().addTo(map); // Separate layer for route markers
let visitOrder =[];

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

// Create markers on the map for each museum without numbering
function createMarkers() {
  museumsData.forEach((museum) => {
    L.marker([museum.lat, museum.lng], {
      icon: L.divIcon({
        className: 'museum-marker',
        html: '', // No numbering here
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


async function calculateOptimalRoute() {
  // Set start and end coordinates based on user selection
  setCoordsFromDropdown(startLocationDropdown, coords => (startCoords = coords));
  setCoordsFromDropdown(endLocationDropdown, coords => (endCoords = coords));

  if (!startCoords || !endCoords) {
    alert("Please select valid start and end locations.");
    return;
  }

  // Create a new array for route calculation that includes start and end points
  const routeMuseums = [
    { lat: startCoords[1], lng: startCoords[0], name: "Start" },
    ...museumsData,
    { lat: endCoords[1], lng: endCoords[0], name: "End" }
  ];

  // Prepare the coordinates string for OSRM Table API
  const coordinates = routeMuseums.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const osrmUrl = `https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=distance`;

  try {
    const response = await fetch(osrmUrl);
    const data = await response.json();

    if (data.code !== "Ok" || !data.distances) {
      console.error("Failed to fetch route data or received invalid data:", data);
      return;
    }

    // Solve for optimal route order with fixed start and end nodes
    const optimalOrder = solveTSPWithFixedEnds(data.distances);

    // Map the optimal order indices back to the routeMuseums
    const orderedMuseums = optimalOrder.map(index => routeMuseums[index]);

    // Set visitOrder excluding Start and End for display purposes
    visitOrder = orderedMuseums.slice(1, -1);

    // Display the route on the map
    displayRouteOnMap(orderedMuseums);

    // Show the "Start the Route" button
    startRouteButton.style.display = "block";
  } catch (error) {
    console.error("Error in calculateOptimalRoute:", error);
  }
}


function displayRouteOnMap(orderedMuseums) {
  routeLayer.clearLayers();
  visitSequenceContainer.innerHTML = "<h4>Visit Sequence</h4><ul>";

  // Prepare the coordinates string for the OSRM Route API
  const routeCoordinates = orderedMuseums.map(museum => `${museum.lng},${museum.lat}`).join(';');
  const osrmRouteUrl = `https://router.project-osrm.org/route/v1/driving/${routeCoordinates}?overview=full&geometries=geojson`;

  fetch(osrmRouteUrl)
    .then(response => response.json())
    .then(routeData => {
      if (routeData.code !== "Ok") {
        console.error("Failed to fetch route geometry:", routeData);
        return;
      }

      const routeGeometry = routeData.routes[0].geometry;
      L.geoJSON(routeGeometry).addTo(routeLayer); // Display the route on the map

      // Add markers for intermediate nodes only
      const visitSequence = orderedMuseums.filter(
        museum => museum.name !== "Start" && museum.name !== "End"
      );

      visitSequence.forEach((museum, index) => {
        L.marker([museum.lat, museum.lng], {
          icon: L.divIcon({
            className: 'museum-marker',
            html: `${index + 1}`, // Assign numbers only to intermediate nodes
            iconSize: [28, 28],
          })
        })
          .bindTooltip(museum.name, { permanent: true, direction: 'top' })
          .addTo(routeLayer);

        // Add intermediate nodes to the sidebar
        const listItem = document.createElement('li');
        listItem.innerHTML = `<b>${index + 1}. ${museum.name}</b><br>Address: ${
          museum.address || 'Not available'
        }<br>Hours: ${museum.hours || 'Not available'}`;
        visitSequenceContainer.querySelector("ul").appendChild(listItem);
      });
    })
    .catch(error => console.error("Error fetching route geometry:", error));
}





function solveTSPWithFixedEnds(distances) {
  const n = distances.length;

  // Start is fixed at index 0 and end is fixed at index n-1
  const visited = new Array(n).fill(false);
  visited[0] = true; // Start node
  visited[n - 1] = true; // End node

  const route = [0]; // Start with the first node

  // Solve for intermediate nodes
  let currentNode = 0;
  for (let step = 1; step < n - 1; step++) {
    let nearest = -1;
    let minDistance = Infinity;

    for (let i = 1; i < n - 1; i++) { // Exclude start and end
      if (!visited[i] && distances[currentNode][i] < minDistance) {
        nearest = i;
        minDistance = distances[currentNode][i];
      }
    }

    if (nearest !== -1) {
      route.push(nearest);
      visited[nearest] = true;
      currentNode = nearest;
    }
  }

  // Add the end node to complete the route
  route.push(n - 1);

  return route; // Return the optimal order
}


// Initialize and call calculateRoute when directions button is clicked
getDirectionsBtn.addEventListener('click', () => {
  setCoordsFromDropdown(startLocationDropdown, coords => startCoords = coords);
  setCoordsFromDropdown(endLocationDropdown, coords => endCoords = coords);

  if (!startCoords || !endCoords) {
    alert("Please select valid start and end locations.");
    return;
  }

  calculateOptimalRoute();
});


  
// Start the application
initializeApp();

// Function to display the welcome modal
function showWelcomeModal() {
    const welcomeModal = document.getElementById('welcomeModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
  
    // Display the modal
    welcomeModal.style.display = 'flex';
  
    // Hide the sidebar toggle button when modal is open
    sidebarToggle.style.display = 'none';
  
    // Close the modal when "Get Started" button is clicked
    closeModalBtn.addEventListener('click', () => {
      welcomeModal.style.display = 'none';
      sidebarToggle.style.display = 'block'; // Show the sidebar toggle button again
    });
  }
  
  
  // Show the welcome modal when the page loads
  window.addEventListener('load', showWelcomeModal);
  
// Function to generate the Google Maps URL and open it
function openInGoogleMaps() {
  // Define end and waypoints using coordinates
  const end = `${endCoords[1]},${endCoords[0]}`;
  
  // Construct waypoints starting from the first museum in the visit order
  const waypoints = visitOrder.map(museum => `${museum.lat},${museum.lng}`).join('|');

  // Create the Google Maps directions URL without specifying the start node
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${end}&waypoints=${waypoints}&travelmode=driving`;

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


// Sidebar for Mobile View
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.createElement('button');
sidebarToggle.innerText = '☰';
sidebarToggle.classList.add('sidebar-toggle');

// Append the toggle button to the body (or map container)
document.body.appendChild(sidebarToggle);

// Toggle sidebar visibility on mobile
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    console.log("Sidebar toggle clicked. Open class:", sidebar.classList.contains('open'));
  
    // Toggle button icon
    sidebarToggle.innerHTML = sidebar.classList.contains('open') ? '✖' : '☰';
  });
  