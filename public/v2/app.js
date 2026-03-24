const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem("cart") || "[]"),
  selectedCategory: "all",
  searchTerm: "",
  sortBy: "featured",
};

const elements = {
  productGrid: document.getElementById("productGrid"),
  productCardTemplate: document.getElementById("productCardTemplate"),
  resultMeta: document.getElementById("resultMeta"),
  categoryFilters: document.getElementById("categoryFilters"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  cartCount: document.getElementById("cartCount"),
  cartTotal: document.getElementById("cartTotal"),
  cartItems: document.getElementById("cartItems"),
  cartDrawer: document.getElementById("cartDrawer"),
  cartBackdrop: document.getElementById("cartBackdrop"),
  openCartBtn: document.getElementById("openCartBtn"),
  closeCartBtn: document.getElementById("closeCartBtn"),
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

init();
initScrollEffects();
checkStoreHours();

// ── Store hours ────────────────────────────────────────────────
// Open Mon–Sat 10 AM – 9 PM (CT). Last online order: 8:30 PM. Closed Sundays.
function getStoreStatus() {
  const now = new Date();
  const ct = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const day = ct.getDay(); // 0=Sun, 6=Sat
  const mins = ct.getHours() * 60 + ct.getMinutes();

  if (day === 0) return { open: false, msg: "We're closed on Sundays. See you Monday — 10 AM to 9 PM!" };
  if (mins < 600)  return { open: false, msg: "We open at 10 AM Mon–Sat. Check back soon!" };
  if (mins >= 1230) return { open: false, msg: "Online orders close at 8:30 PM. Our store closes at 9 PM. See you tomorrow!" };
  return { open: true };
}

function checkStoreHours() {
  const status = getStoreStatus();
  const banner = document.getElementById("storeClosedBanner");
  const msg    = document.getElementById("storeClosedMsg");
  if (!status.open && banner) {
    msg.textContent = status.msg;
    banner.hidden = false;
  }
}

async function init() {
  bindEvents();
  renderCart();
  updateHeaderAuth();

  try {
    const response = await fetch("/api/products", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Failed to load products (${response.status})`);
    }

    state.products = await response.json();
    renderCategoryFilters();
    renderProducts();
  } catch (error) {
    elements.resultMeta.textContent = "Unable to load products right now.";
    elements.productGrid.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    renderProducts();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    renderProducts();
  });

  elements.openCartBtn.addEventListener("click", openCart);
  elements.closeCartBtn.addEventListener("click", closeCart);
  elements.cartBackdrop.addEventListener("click", closeCart);
}

function getCategoryLabel(category) {
  return category
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getBasePrice(product) {
  if (Array.isArray(product.sizes) && product.sizes.length) {
    return Math.min(...product.sizes.map((size) => Number(size.price || product.price || 0)));
  }
  return Number(product.price || 0);
}

function getFilteredProducts() {
  const filtered = state.products.filter((product) => {
    const inCategory = state.selectedCategory === "all" || product.category === state.selectedCategory;
    const searchText = `${product.name || ""} ${product.category || ""} ${product.description || ""}`.toLowerCase();
    const matchesSearch = !state.searchTerm || searchText.includes(state.searchTerm);
    return inCategory && matchesSearch;
  });

  const sorter = {
    featured: (a, b) => Number(b.inStock) - Number(a.inStock),
    priceAsc: (a, b) => getBasePrice(a) - getBasePrice(b),
    priceDesc: (a, b) => getBasePrice(b) - getBasePrice(a),
    nameAsc: (a, b) => (a.name || "").localeCompare(b.name || ""),
  }[state.sortBy];

  return filtered.sort(sorter);
}

function renderCategoryFilters() {
  const categories = Array.from(new Set(state.products.map((product) => product.category).filter(Boolean))).sort();
  const allCategories = ["all", ...categories];

  elements.categoryFilters.innerHTML = "";
  allCategories.forEach((category) => {
    const button = document.createElement("button");
    button.className = `chip ${state.selectedCategory === category ? "active" : ""}`;
    button.type = "button";
    button.role = "tab";
    button.ariaSelected = state.selectedCategory === category ? "true" : "false";
    button.textContent = category === "all" ? "All" : getCategoryLabel(category);
    button.addEventListener("click", () => {
      state.selectedCategory = category;
      renderCategoryFilters();
      renderProducts();
    });
    elements.categoryFilters.appendChild(button);
  });
}

function renderProducts() {
  const products = getFilteredProducts();

  elements.resultMeta.textContent = `${products.length} product${products.length === 1 ? "" : "s"} shown`;
  elements.productGrid.innerHTML = "";

  if (!products.length) {
    elements.productGrid.innerHTML = "<p>No products match your filters.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();

  products.forEach((product) => {
    const node = elements.productCardTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".product-image");
    const category = node.querySelector(".product-category");
    const name = node.querySelector(".product-name");
    const description = node.querySelector(".product-description");
    const sizeChipsEl = node.querySelector(".size-chips");
    const price = node.querySelector(".product-price");
    const addBtn = node.querySelector(".add-btn");

    const hasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
    let selectedSize = hasSizes ? product.sizes[0] : null;

    image.src = normalizeImagePath(product.image);
    image.alt = product.name || "Product image";
    image.onerror = () => {
      image.src = "https://placehold.co/640x480/f4ede1/2a2f28?text=Fiesta+Liquor";
    };

    category.textContent = getCategoryLabel(product.category || "other");
    name.textContent = product.name || "Unnamed product";
    description.textContent = product.description || "No description provided.";

    if (!product.inStock) {
      node.classList.add("out-of-stock");
    }

    function getSelectedPrice() {
      return selectedSize ? Number(selectedSize.price) : Number(product.price || 0);
    }

    function updatePrice() {
      const p = getSelectedPrice();
      price.textContent = hasSizes && !selectedSize ? `From ${currency.format(getBasePrice(product))}` : currency.format(p);
    }

    if (hasSizes) {
      product.sizes.forEach((sizeObj) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `size-chip${sizeObj === selectedSize ? " selected" : ""}`;
        chip.textContent = sizeObj.size;
        chip.addEventListener("click", () => {
          selectedSize = sizeObj;
          sizeChipsEl.querySelectorAll(".size-chip").forEach((c) => c.classList.remove("selected"));
          chip.classList.add("selected");
          updatePrice();
        });
        sizeChipsEl.appendChild(chip);
      });
    }

    updatePrice();

    const isInStock = product.inStock && (!hasSizes || selectedSize?.inStock !== false);
    addBtn.disabled = !isInStock;
    addBtn.textContent = isInStock ? "Add to Cart" : "Out of Stock";

    addBtn.addEventListener("click", () => {
      addToCart(product, selectedSize);
      addBtn.textContent = "Added!";
      addBtn.classList.add("added");
      setTimeout(() => {
        addBtn.textContent = "Add to Cart";
        addBtn.classList.remove("added");
      }, 1200);
    });

    fragment.appendChild(node);
  });

  elements.productGrid.appendChild(fragment);

  // Trigger scroll-reveal on newly rendered cards
  observeProductCards();
}

function normalizeImagePath(rawPath) {
  if (!rawPath) return "https://placehold.co/640x480/f4ede1/2a2f28?text=Fiesta+Liquor";
  if (rawPath.startsWith("http")) return rawPath;
  return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
}

function addToCart(product, selectedSize = null) {
  const price = selectedSize ? Number(selectedSize.price) : Number(product.price || 0);

  const existing = state.cart.find(
    (item) => item.id === product.id && (item.selectedSize?.size || null) === (selectedSize?.size || null)
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      productId: product.id,
      name: product.name,
      price,
      quantity: 1,
      category: product.category,
      image: normalizeImagePath(product.image),
      selectedSize,
    });
  }

  persistCart();
  renderCart();
}

function removeFromCart(id, size) {
  state.cart = state.cart.filter((item) => !(item.id === id && (item.selectedSize?.size || null) === size));
  persistCart();
  renderCart();
}

function changeQuantity(id, size, delta) {
  const item = state.cart.find((i) => i.id === id && (i.selectedSize?.size || null) === size);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(id, size);
    return;
  }
  persistCart();
  renderCart();
}

function persistCart() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Update all count/total indicators
  elements.cartCount.textContent = String(count);
  elements.cartTotal.textContent = currency.format(total);
  const totalBig = document.getElementById("cartTotalBig");
  if (totalBig) totalBig.textContent = currency.format(total);
  const headerCount = document.getElementById("cartHeaderCount");
  if (headerCount) headerCount.textContent = String(count);

  if (!state.cart.length) {
    elements.cartItems.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>Your cart is empty</p>
        <small>Add something from the catalog below</small>
      </div>`;
    return;
  }

  elements.cartItems.innerHTML = "";
  state.cart.forEach((item) => {
    const sizeKey = item.selectedSize?.size || null;
    const row = document.createElement("div");
    row.className = "cart-row";

    row.innerHTML = `
      <img class="cart-item-img" src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.name)}"
           onerror="this.src='https://placehold.co/60x60/f4ede1/2a2f28?text=🍾'">
      <div class="cart-item-info">
        <span class="cart-item-name">${escapeHtml(item.name)}</span>
        ${sizeKey ? `<span class="cart-item-size">${escapeHtml(sizeKey)}</span>` : ""}
        <div class="cart-qty-row">
          <button class="qty-btn dec-btn" type="button" aria-label="Decrease quantity">−</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn inc-btn" type="button" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div class="cart-item-right">
        <span class="cart-item-price">${currency.format(item.price * item.quantity)}</span>
        <button class="cart-remove-btn" type="button" aria-label="Remove item">✕ remove</button>
      </div>
    `;

    row.querySelector(".dec-btn").addEventListener("click", () => changeQuantity(item.id, sizeKey, -1));
    row.querySelector(".inc-btn").addEventListener("click", () => changeQuantity(item.id, sizeKey, +1));
    row.querySelector(".cart-remove-btn").addEventListener("click", () => removeFromCart(item.id, sizeKey));
    elements.cartItems.appendChild(row);
  });
}

function openCart() {
  elements.cartDrawer.classList.add("open");
  elements.cartDrawer.ariaHidden = "false";
  elements.cartBackdrop.hidden = false;
}

function closeCart() {
  elements.cartDrawer.classList.remove("open");
  elements.cartDrawer.ariaHidden = "true";
  elements.cartBackdrop.hidden = true;
}

function updateHeaderAuth() {
  const user = JSON.parse(localStorage.getItem("currentUser") || localStorage.getItem("firebaseUser") || "null");
  const authLink = document.getElementById("authLink");
  const accountLink = document.getElementById("accountLink");
  if (user) {
    if (authLink) authLink.style.display = "none";
    if (accountLink) {
      const firstName = (user.name || user.displayName || user.email || "Account").split(" ")[0];
      accountLink.textContent = firstName;
      accountLink.href = "/account";
    }
  } else {
    if (authLink) authLink.style.display = "";
    if (accountLink) accountLink.style.display = "none";
  }
}

// ── Scroll effects ────────────────────────────────────────────
function initScrollEffects() {
  // 1. Sticky nav darkens on scroll
  const header = document.getElementById("siteHeader");
  if (header) {
    window.addEventListener("scroll", () => {
      header.classList.toggle("scrolled", window.scrollY > 24);
    }, { passive: true });
  }

  // 2. Hero elements fade in on page load (staggered)
  const heroEls = document.querySelectorAll(".reveal-hero");
  heroEls.forEach((el, i) => {
    setTimeout(() => el.classList.add("in-view"), 120 + i * 130);
  });

  // 3. Generic scroll-reveal (controls bar, etc.)
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll(".scroll-reveal").forEach((el) => revealObserver.observe(el));
}

// ── Product card scroll-reveal (called after cards are rendered) ──
function observeProductCards() {
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll(".product-card").forEach((card, i) => {
    // Stagger up to 5 columns (cycle resets every 5 cards)
    card.style.transitionDelay = `${(i % 5) * 60}ms`;
    cardObserver.observe(card);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
