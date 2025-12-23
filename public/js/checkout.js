// Check age verification
if (!localStorage.getItem("is21Confirmed")) {
    alert("You must confirm you are 21+ to order alcohol.");
    window.location.href = `/age-check.html?return=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Age verification required");
}

// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    alert("Please sign in to continue with checkout.");
    localStorage.setItem('checkoutRedirect', 'true');
    window.location.href = "/account.html";
    throw new Error("Authentication required");
}

// ...existing code...