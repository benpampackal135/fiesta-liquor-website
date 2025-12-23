// Firebase init (compat build)
// Works with the global `firebase` object provided by firebase-app-compat.js
// Prevent duplicate declarations - check if already exists
if (typeof firebaseConfig === 'undefined') {
  var firebaseConfig = {
    apiKey: "AIzaSyConLQv2veihJ6pq4KUikKm0yramP17xDI",
    authDomain: "fiesta-liquor-store.firebaseapp.com",
    projectId: "fiesta-liquor-store",
    storageBucket: "fiesta-liquor-store.firebasestorage.app",
    messagingSenderId: "432960193994",
    appId: "1:432960193994:web:b756616669105d4c997b33",
    measurementId: "G-C03FH2D2GZ"
  };
}

// Avoid re-initializing if already initialized
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}