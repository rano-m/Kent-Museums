const map = L.map('map').setView([39.224308372070155, -76.06278080179688], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let museumsData = [];
let startCoords = null;
let endCoords = null;
let routeLayer = L.layerGroup().addTo(map); // Separate layer for route markers
let visitOrder =[];

// Add excluded museums set
let excludedMuseums = new Set();

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

let initialLayer = L.layerGroup().addTo(map); // Separate layer for initial markers

function createMarkers() {
  museumsData.forEach((museum) => {
    const customCircleIcon = L.divIcon({
      html: '<i class="fa fa-university museum-circle-marker"></i>',
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 6],
    });

    const marker = L.marker([museum.lat, museum.lng], { icon: customCircleIcon })
      .addTo(initialLayer) // Add to the initial layer
      .bindPopup(`
        <b>${museum.name}</b><br>
        <strong>Address:</strong> ${museum.address}<br>
        <strong>Hours:</strong> ${museum.hours || 'Not available'}<br>
        <strong>Email:</strong> <a href="mailto:${museum.contact_email}">${museum.contact_email}</a><br>
        <strong>Phone:</strong> <a href="tel:${museum.contact_phone}">${museum.contact_phone}</a><br>
        <strong>Website:</strong> <a href="${museum.website}" target="_blank">${museum.website}</a>
      `)
      .bindTooltip(museum.name, {
        permanent: true,
        direction: 'top',
        className: 'museum-label',
      });

    // Hide label when pop-up opens
    marker.on('popupopen', (e) => {
      const tooltip = e.target.getTooltip();
      if (tooltip) {
        tooltip._container.style.display = 'none';
      }
    });

    // Show label when pop-up closes
    marker.on('popupclose', (e) => {
      const tooltip = e.target.getTooltip();
      if (tooltip) {
        tooltip._container.style.display = '';
      }
    });
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
  initialLayer.clearLayers();
  routeLayer.clearLayers();
  
  const visitSequenceContainer = document.getElementById('visitSequence');
  visitSequenceContainer.innerHTML = "<ul></ul>";

  const routeCoordinates = orderedMuseums.map((museum) => `${museum.lng},${museum.lat}`).join(';');
  const osrmRouteUrl = `https://router.project-osrm.org/route/v1/driving/${routeCoordinates}?overview=full&geometries=geojson`;

  fetch(osrmRouteUrl)
    .then((response) => response.json())
    .then((routeData) => {
      if (routeData.code !== "Ok") {
        console.error("Failed to fetch route geometry:", routeData);
        return;
      }

      const routeGeometry = routeData.routes[0].geometry;
      L.geoJSON(routeGeometry).addTo(routeLayer);

      orderedMuseums
        .filter((museum) => museum.name !== "Start" && museum.name !== "End")
        .forEach((museum, index) => {
          const numberedIcon = L.divIcon({
            className: 'museum-numbered',
            html: `${index + 1}`,
            iconSize: [28, 28],
          });

          const marker = L.marker([museum.lat, museum.lng], { icon: numberedIcon })
            .bindTooltip(museum.name, {
              permanent: true,
              direction: 'top',
              className: 'museum-label',
              offset: [0, -10],
            })
            .bindPopup(`
              <div class="museum-popup">
                <b>${museum.name}</b><br>
                <strong>Address:</strong> ${museum.address || 'Not available'}<br>
                <strong>Hours:</strong> ${museum.hours || 'Not available'}<br>
                <strong>Email:</strong> <a href="mailto:${museum.contact_email}">${museum.contact_email}</a><br>
                <strong>Phone:</strong> <a href="tel:${museum.contact_phone}">${museum.contact_phone}</a><br>
                <strong>Website:</strong> <a href="${museum.website}" target="_blank">${museum.website}</a>
              </div>
            `)
            .addTo(routeLayer);

          const listItem = document.createElement('li');
          listItem.className = 'visit-item';
          
          const content = document.createElement('div');
          content.className = 'visit-content';
          
          const actions = document.createElement('div');
          actions.className = 'visit-actions';
          
          const excludeBtn = document.createElement('button');
          excludeBtn.className = 'exclude-btn';
          excludeBtn.innerHTML = '✕';
          excludeBtn.title = 'Remove from route';
          
          const museumIndex = museumsData.findIndex(m => m.name === museum.name);
          excludeBtn.onclick = () => {
            excludedMuseums.add(museumIndex);
            recalculateRoute();
          };

          // Format hours for better readability
          const formatHours = (hours) => {
            if (!hours) return 'Hours not available';
            return hours.split(',').map(h => h.trim()).join('<br>');
          };

          content.innerHTML = `
            <div class="visit-number">${index + 1}</div>
            <div class="visit-details">
              <strong>${museum.name}</strong>
              <div class="visit-info">
                <div class="visit-info-item">
                  <i class="fa fa-map-marker"></i>
                  <span>${museum.address || 'Address not available'}</span>
                </div>
                <div class="visit-info-item">
                  <i class="fa fa-clock-o"></i>
                  <span>${formatHours(museum.hours)}</span>
                </div>
                ${museum.contact_phone ? `
                <div class="visit-info-item">
                  <i class="fa fa-phone"></i>
                  <a href="tel:${museum.contact_phone}">${museum.contact_phone}</a>
                </div>
                ` : ''}
                ${museum.contact_email ? `
                <div class="visit-info-item">
                  <i class="fa fa-envelope"></i>
                  <a href="mailto:${museum.contact_email}">${museum.contact_email}</a>
                </div>
                ` : ''}
                ${museum.website ? `
                <div class="visit-info-item">
                  <i class="fa fa-globe"></i>
                  <a href="${museum.website}" target="_blank">Visit Website</a>
                </div>
                ` : ''}
              </div>
            </div>
          `;

          actions.appendChild(excludeBtn);
          listItem.appendChild(content);
          listItem.appendChild(actions);
          visitSequenceContainer.querySelector("ul").appendChild(listItem);
        });
    })
    .catch((error) => console.error("Error fetching route geometry:", error));
}





function solveTSPWithFixedEnds(distances) {
  const n = distances.length;
  
  // Initialize DP arrays
  // dp[mask][last] represents shortest path visiting vertices in mask and ending at last
  const dp = Array(1 << n).fill().map(() => Array(n).fill(Infinity));
  const parent = Array(1 << n).fill().map(() => Array(n).fill(-1));
  
  // Base case: start from node 0
  dp[1][0] = 0;  // 1 represents only node 0 visited
  
  // Try all possible sets of vertices
  for (let mask = 1; mask < (1 << n); mask++) {
    // Skip if start node (0) is not in mask
    if (!(mask & 1)) continue;
    
    // Skip if end node (n-1) is in mask but it's not the complete tour
    if ((mask & (1 << (n-1))) && mask !== ((1 << n) - 1)) continue;
    
    // For each possible last node in current path
    for (let last = 0; last < n; last++) {
      // Skip if last node is not in mask
      if (!(mask & (1 << last))) continue;
      
      // Try to add one more node to path
      const prevMask = mask ^ (1 << last);  // Remove last node from mask
      if (prevMask === 0) continue;  // Skip if no previous nodes
      
      // Try all possible previous nodes
      for (let prev = 0; prev < n; prev++) {
        if (!(prevMask & (1 << prev))) continue;  // Skip if prev not in prevMask
        
        // Calculate new distance
        const newDist = dp[prevMask][prev] + distances[prev][last];
        if (newDist < dp[mask][last]) {
          dp[mask][last] = newDist;
          parent[mask][last] = prev;
        }
      }
    }
  }
  
  // Find optimal path ending at n-1
  const finalMask = (1 << n) - 1;  // All nodes visited
  if (dp[finalMask][n-1] === Infinity) {
    console.error("No valid tour found");
    return [0, ...Array.from({length: n-2}, (_, i) => i+1), n-1];  // Return simple path as fallback
  }
  
  // Reconstruct path
  const path = [];
  let currentMask = finalMask;
  let currentNode = n-1;
  
  while (currentNode !== -1) {
    path.unshift(currentNode);
    const nextNode = parent[currentMask][currentNode];
    if (nextNode === -1) break;
    currentMask ^= (1 << currentNode);
    currentNode = nextNode;
  }
  
  return path;
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
    sidebarToggle.innerHTML = sidebar.classList.contains('open') ? '☰' : '✖';
  });
  
function printMap() {
  // Get references to the map and sidebar
  const mapElement = document.getElementById('map');
  const sidebarElement = document.getElementById('sidebar');

  // Temporarily hide the sidebar
  sidebarElement.style.display = 'none';

  // Trigger the print dialog for the map view
  window.print();

  // Restore the sidebar after printing
  sidebarElement.style.display = '';
}

// Add event listener to the Print Map button
document.getElementById('printMapIcon').addEventListener('click', printMap);

async function recalculateRoute() {
  // Filter out excluded museums
  const activeMuseums = museumsData.filter((_, index) => !excludedMuseums.has(index));

  // Create new route array with active museums
  const routeMuseums = [
    { lat: startCoords[1], lng: startCoords[0], name: "Start" },
    ...activeMuseums,
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

    const optimalOrder = solveTSPWithFixedEnds(data.distances);
    const orderedMuseums = optimalOrder.map(index => routeMuseums[index]);
    visitOrder = orderedMuseums.slice(1, -1);
    displayRouteOnMap(orderedMuseums);
    startRouteButton.style.display = "block";
  } catch (error) {
    console.error("Error in recalculateRoute:", error);
  }
}

function resetRoute() {
  excludedMuseums.clear();
  recalculateRoute();
}

document.addEventListener('DOMContentLoaded', function() {
  // ... existing code ...

  // Add reset route button listener
  document.getElementById('reset-route').addEventListener('click', resetRoute);

  initializeMobileBottomSheet();
});

// Add touch handling for mobile bottom sheet
function initializeMobileBottomSheet() {
  const sidebar = document.getElementById('sidebar');
  let startY = 0;
  let startTransform = 0;
  let isDragging = false;

  function handleTouchStart(e) {
    const touch = e.touches[0];
    startY = touch.clientY;
    startTransform = sidebar.getBoundingClientRect().top;
    isDragging = true;
  }

  function handleTouchMove(e) {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    const deltaY = touch.clientY - startY;
    const newTop = Math.min(0, Math.max(-window.innerHeight * 0.6, startTransform - deltaY));
    
    sidebar.style.transform = `translateY(${-newTop}px)`;
    e.preventDefault();
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    
    const currentTop = sidebar.getBoundingClientRect().top;
    const threshold = window.innerHeight * 0.3;
    
    if (currentTop > threshold) {
      sidebar.style.transform = 'translateY(calc(100% - 60px))';
      sidebar.classList.remove('open');
    } else {
      sidebar.style.transform = 'translateY(0)';
      sidebar.classList.add('open');
    }
    
    isDragging = false;
  }

  sidebar.addEventListener('touchstart', handleTouchStart);
  sidebar.addEventListener('touchmove', handleTouchMove);
  sidebar.addEventListener('touchend', handleTouchEnd);

  // Handle the drag handle click
  sidebar.addEventListener('click', (e) => {
    if (e.target === sidebar || e.target.closest('.visit-sequence-header')) {
      sidebar.classList.toggle('open');
    }
  });
}
