/**
 * Age Verification Gate — auto-injects on any page that includes this script.
 * Stores verification in localStorage so users only see it once.
 */
(function () {
  if (localStorage.getItem("ageVerified") === "true") return;

  // Inject gate HTML
  const overlay = document.createElement("div");
  overlay.id = "ageGate";
  overlay.className = "age-gate";
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-labelledby", "ageGateTitle");
  overlay.innerHTML = `
    <div class="age-gate-card">
      <div class="age-gate-icon">21+</div>
      <h2 id="ageGateTitle">Age Verification</h2>
      <p>You must be 21 years or older to enter this site. Please confirm your age to continue.</p>
      <div class="age-gate-actions">
        <button id="ageGateYes" class="primary-btn">I'm 21 or Older</button>
        <button id="ageGateNo" class="ghost-btn">I'm Under 21</button>
      </div>
      <p class="age-gate-disclaimer">By entering this site, you agree that you are of legal drinking age in your jurisdiction.</p>
    </div>
  `;

  document.body.prepend(overlay);
  document.body.style.overflow = "hidden";

  document.getElementById("ageGateYes").addEventListener("click", function () {
    localStorage.setItem("ageVerified", "true");
    overlay.classList.add("age-gate--closing");
    overlay.addEventListener("transitionend", function () {
      overlay.remove();
      document.body.style.overflow = "";
    }, { once: true });
  });

  document.getElementById("ageGateNo").addEventListener("click", function () {
    overlay.querySelector(".age-gate-actions").innerHTML =
      '<p class="age-gate-denied">Sorry, you must be 21 or older to access this site.</p>';
    overlay.querySelector("h2").textContent = "Access Denied";
    overlay.querySelector(".age-gate-card > p").textContent =
      "This website sells alcohol and is restricted to users aged 21 and over.";
  });
})();
