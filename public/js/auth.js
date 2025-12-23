// Helper function to get first name from full name
function getFirstName(fullName) {
    if (!fullName) return 'User';
    const nameParts = fullName.trim().split(/\s+/);
    return nameParts[0] || 'User';
}

// Add this function to update UI based on auth state
function updateAuthUI() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userNameDisplay = document.getElementById('userNameDisplay');
    
    if (token && user) {
        // User is logged in
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (userNameDisplay) {
            userNameDisplay.textContent = getFirstName(user.name);
            userNameDisplay.style.display = 'inline';
        }
        
        // Check if user was trying to checkout
        if (localStorage.getItem('checkoutRedirect') === 'true') {
            localStorage.removeItem('checkoutRedirect');
            window.location.href = '/checkout.html';
        }
    } else {
        // User is logged out
        if (loginBtn) loginBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userNameDisplay) userNameDisplay.style.display = 'none';
    }
}

// Add logout handler
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            // Clear auth data but keep cart and age verification
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            alert('You have been logged out successfully.');
            window.location.href = '/index.html';
        });
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    setupLogout();
});

// Update UI after login
async function handleLogin(email, password) {
    // ...existing login code...
    
    // After successful login:
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    updateAuthUI(); // Update UI
}

// Update UI after registration
async function handleRegister(name, email, phone, password) {
    // ...existing registration code...
    
    // After successful registration:
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    updateAuthUI(); // Update UI
}

// ...existing code...