(function() {
    // Check if age is already verified
    const isAgeVerified = localStorage.getItem("is21Confirmed");
    
    if (isAgeVerified === "true") {
        // Already verified, do nothing
        return;
    }
    
    // Show age verification modal
    const modal = document.getElementById('ageVerificationModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    const checkbox = document.getElementById('ageConfirmCheckbox');
    const submitBtn = document.getElementById('ageSubmitBtn');
    const declineBtn = document.getElementById('ageDeclineBtn');
    
    // Enable/disable submit button based on checkbox
    checkbox.addEventListener('change', function() {
        if (this.checked) {
            submitBtn.disabled = false;
            submitBtn.style.background = '#28a745';
            submitBtn.style.cursor = 'pointer';
        } else {
            submitBtn.disabled = true;
            submitBtn.style.background = '#ccc';
            submitBtn.style.cursor = 'not-allowed';
        }
    });
    
    // Handle submit
    submitBtn.addEventListener('click', function() {
        if (checkbox.checked) {
            localStorage.setItem("is21Confirmed", "true");
            modal.style.display = 'none';
        }
    });
    
    // Handle decline
    declineBtn.addEventListener('click', function() {
        alert("You must be 21 or older to access this website.");
        window.location.href = "https://www.google.com";
    });
    
    // Prevent closing modal by clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            alert("Age verification is required to access this website.");
        }
    });
})();
