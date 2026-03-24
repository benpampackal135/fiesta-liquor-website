// ============================================================
// Location Service — delivery radius restriction logic
// Uses the browser Geolocation API + Haversine formula to
// enforce a maximum delivery radius around each store.
// Pickup orders are NEVER restricted by distance.
// ============================================================

// ── Store locations (lat/lng from the homepage map embeds) ───
const STORE_LOCATIONS = [
  {
    name: 'Fiesta Liquor #1',
    address: '15503 Babcock Rd, San Antonio, TX 78255',
    lat: 29.5885,
    lng: -98.6316
  },
  {
    name: 'KG Liquor',
    address: '8456 Fredericksburg Rd, San Antonio, TX 78229',
    lat: 29.5186,
    lng: -98.5727
  },
  {
    name: 'Fiesta Liquor #5',
    address: '9618 TX-151 #105, San Antonio, TX 78251',
    lat: 29.4454,
    lng: -98.6727
  },
  {
    name: 'Stone Oak Liquor',
    address: '19202 Stone Oak Pkwy #107, San Antonio, TX 78258',
    lat: 29.6272,
    lng: -98.4942
  }
];

// Maximum delivery radius in miles (can be overridden by checkout.js after fetching settings)
var MAX_DELIVERY_RADIUS_MILES = 10;

// ── Haversine formula ───────────────────────────────────────
// Calculates the great-circle distance between two points on
// Earth given their latitude and longitude in decimal degrees.
//
// How it works:
//   1. Convert lat/lng from degrees to radians
//   2. Compute differences in lat (dLat) and lng (dLng)
//   3. Apply the Haversine formula:
//        a = sin²(dLat/2) + cos(lat1) · cos(lat2) · sin²(dLng/2)
//        c = 2 · atan2(√a, √(1−a))
//        distance = R · c
//      where R = Earth's radius (3958.8 miles)
//   4. The result is the straight-line distance in miles
//
// This is accurate enough for distances under ~100 miles,
// which is well within our delivery use case.
// ─────────────────────────────────────────────────────────────
function haversineDistanceMiles(lat1, lng1, lat2, lng2) {
  var R = 3958.8; // Earth's radius in miles
  var toRad = Math.PI / 180;

  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;

  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ── Get user's current position ─────────────────────────────
// Returns a Promise that resolves with { lat, lng } or rejects
// with a user-friendly error message.
function getUserLocation() {
  return new Promise(function (resolve, reject) {
    // Check if the Geolocation API is available
    if (!navigator.geolocation) {
      reject('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      function (error) {
        // Provide clear messages for each error code
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              'Location access was denied. Please enable location permissions in your browser settings to use delivery.'
            );
            break;
          case error.POSITION_UNAVAILABLE:
            reject(
              'Your location could not be determined. Please check your device settings.'
            );
            break;
          case error.TIMEOUT:
            reject(
              'Location request timed out. Please try again.'
            );
            break;
          default:
            reject('An unknown error occurred while getting your location.');
        }
      },
      {
        enableHighAccuracy: false, // coarse location is fine for radius check
        timeout: 10000,            // 10-second timeout
        maximumAge: 300000         // cache position for 5 minutes
      }
    );
  });
}

// ── Compute distances to all stores ─────────────────────────
// Given the user's { lat, lng }, returns an array of objects:
//   { store, distanceMiles, withinRadius }
// sorted by distance (nearest first).
function getStoreDistances(userLat, userLng) {
  return STORE_LOCATIONS.map(function (store) {
    var dist = haversineDistanceMiles(userLat, userLng, store.lat, store.lng);
    return {
      store: store,
      distanceMiles: Math.round(dist * 10) / 10, // round to 1 decimal
      withinRadius: dist <= MAX_DELIVERY_RADIUS_MILES
    };
  }).sort(function (a, b) {
    return a.distanceMiles - b.distanceMiles;
  });
}

// ── Find nearest store within delivery radius ───────────────
// Returns the nearest store object if within radius, or null.
function getNearestDeliveryStore(userLat, userLng) {
  var distances = getStoreDistances(userLat, userLng);
  for (var i = 0; i < distances.length; i++) {
    if (distances[i].withinRadius) {
      return distances[i];
    }
  }
  return null;
}

// ── Check delivery eligibility ──────────────────────────────
// Main entry point. Returns a Promise that resolves with:
//   {
//     eligible: true/false,
//     nearestStore: { store, distanceMiles } or null,
//     allDistances: [ { store, distanceMiles, withinRadius }, ... ],
//     error: null or string (if geolocation failed)
//   }
function checkDeliveryEligibility() {
  return getUserLocation()
    .then(function (coords) {
      var distances = getStoreDistances(coords.lat, coords.lng);
      var nearest = null;
      for (var i = 0; i < distances.length; i++) {
        if (distances[i].withinRadius) {
          nearest = distances[i];
          break;
        }
      }
      return {
        eligible: nearest !== null,
        nearestStore: nearest,
        allDistances: distances,
        userCoords: coords,
        error: null
      };
    })
    .catch(function (errMsg) {
      return {
        eligible: false,
        nearestStore: null,
        allDistances: [],
        userCoords: null,
        error: errMsg
      };
    });
}

// ── Delivery map (Leaflet.js) ────────────────────────────────
// Renders an interactive map showing:
//   - Each store as a marker
//   - A 10-mile radius circle around each store
//   - The user's location as a blue dot
//   - Circles are green if the user is inside, red if outside
//
// Requires Leaflet CSS + JS loaded before this script.
// The map container must have id="deliveryMap".
// ─────────────────────────────────────────────────────────────

var _deliveryMap = null; // keep reference to avoid re-creating

function renderDeliveryMap(userCoords, allDistances) {
  var mapEl = document.getElementById('deliveryMap');
  if (!mapEl || typeof L === 'undefined') return;

  // Compute radius in meters from current max radius setting
  var RADIUS_METERS = MAX_DELIVERY_RADIUS_MILES * 1609.34;

  // Show the map container
  mapEl.style.display = 'block';

  // If map already exists, remove it so we can re-draw
  if (_deliveryMap) {
    _deliveryMap.remove();
    _deliveryMap = null;
  }

  // Center on user if available, otherwise on San Antonio
  var centerLat = userCoords ? userCoords.lat : 29.53;
  var centerLng = userCoords ? userCoords.lng : -98.58;

  _deliveryMap = L.map('deliveryMap', {
    scrollWheelZoom: false // prevent accidental scroll-hijack
  }).setView([centerLat, centerLng], 11);

  // OpenStreetMap tile layer (free, no API key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(_deliveryMap);

  // Collect all points so we can fit bounds
  var bounds = [];

  // Draw a circle + marker for each store
  for (var i = 0; i < STORE_LOCATIONS.length; i++) {
    var store = STORE_LOCATIONS[i];
    var storeLatLng = [store.lat, store.lng];
    bounds.push(storeLatLng);

    // Determine if user is within this store's radius
    var withinThis = false;
    if (allDistances) {
      for (var j = 0; j < allDistances.length; j++) {
        if (allDistances[j].store.name === store.name) {
          withinThis = allDistances[j].withinRadius;
          break;
        }
      }
    }

    // Radius circle — green if user is inside, light red if outside
    L.circle(storeLatLng, {
      radius: RADIUS_METERS,
      color: withinThis ? '#2e7d32' : '#c62828',
      fillColor: withinThis ? '#a5d6a7' : '#ef9a9a',
      fillOpacity: 0.15,
      weight: 2
    }).addTo(_deliveryMap);

    // Store marker (red pin)
    L.marker(storeLatLng)
      .addTo(_deliveryMap)
      .bindPopup(
        '<strong>' + store.name + '</strong><br>' +
        store.address + '<br>' +
        '<span style="font-size:0.85em;color:#666;">' +
        MAX_DELIVERY_RADIUS_MILES + '-mile delivery radius</span>'
      );
  }

  // User location marker (blue dot)
  if (userCoords) {
    var userLatLng = [userCoords.lat, userCoords.lng];
    bounds.push(userLatLng);

    L.circleMarker(userLatLng, {
      radius: 8,
      color: '#1565c0',
      fillColor: '#42a5f5',
      fillOpacity: 0.9,
      weight: 2
    })
      .addTo(_deliveryMap)
      .bindPopup('Your location')
      .openPopup();
  }

  // Fit the map to show all markers + user
  if (bounds.length > 1) {
    _deliveryMap.fitBounds(bounds, { padding: [40, 40] });
  }
}

// Hide / destroy map (called when switching back to pickup)
function hideDeliveryMap() {
  var mapEl = document.getElementById('deliveryMap');
  if (mapEl) mapEl.style.display = 'none';
  if (_deliveryMap) {
    _deliveryMap.remove();
    _deliveryMap = null;
  }
}

// ── UI helper: select a store radio button by name ──────────
// Programmatically selects the radio button matching storeName
// and updates the visual highlight.
function selectStoreByName(storeName) {
  var radios = document.querySelectorAll('input[name="storeLocation"]');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].value === storeName) {
      radios[i].checked = true;
      break;
    }
  }
  // Update label highlights (function defined in checkout.html)
  if (typeof updateLocationLabels === 'function') {
    updateLocationLabels();
  }
}
