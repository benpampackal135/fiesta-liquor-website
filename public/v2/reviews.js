// ============================================================
// Reviews & Product Requests — Client-side logic
// ============================================================

(function () {
  'use strict';

  var apiBase = window.API_BASE_URL || '';

  // ── Star rating input ───────────────────────────────────────
  var selectedRating = 0;
  var starBtns = document.querySelectorAll('#starRatingInput .star-btn');

  starBtns.forEach(function (btn) {
    btn.addEventListener('mouseenter', function () {
      highlightStars(parseInt(btn.dataset.value));
    });

    btn.addEventListener('click', function () {
      selectedRating = parseInt(btn.dataset.value);
      document.getElementById('reviewRating').value = selectedRating;
      highlightStars(selectedRating);
    });
  });

  // Reset stars on mouse leave (back to selected)
  var starContainer = document.getElementById('starRatingInput');
  if (starContainer) {
    starContainer.addEventListener('mouseleave', function () {
      highlightStars(selectedRating);
    });
  }

  function highlightStars(count) {
    starBtns.forEach(function (btn) {
      var val = parseInt(btn.dataset.value);
      btn.classList.toggle('active', val <= count);
    });
  }

  // ── Load reviews ────────────────────────────────────────────
  function loadReviews() {
    fetch(apiBase + '/api/reviews')
      .then(function (res) { return res.json(); })
      .then(function (reviews) {
        renderReviews(reviews);
      })
      .catch(function (err) {
        console.error('Failed to load reviews:', err);
        // Fallback: show empty state
        renderReviews([]);
      });
  }

  function renderReviews(reviews) {
    var list = document.getElementById('reviewsList');
    var empty = document.getElementById('reviewsEmpty');
    if (!list) return;

    if (!reviews || reviews.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    list.innerHTML = reviews.map(function (r) {
      return '<div class="review-card">' +
        '<div class="review-header">' +
          '<span class="review-author">' + escapeHtml(r.name) + '</span>' +
          '<span class="review-date">' + formatDate(r.createdAt) + '</span>' +
        '</div>' +
        '<div class="review-stars">' + renderStars(r.rating) + '</div>' +
        '<p class="review-comment">' + escapeHtml(r.comment) + '</p>' +
      '</div>';
    }).join('');
  }

  function renderStars(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += i <= rating ? '&#9733;' : '&#9734;';
    }
    return html;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── Submit review ───────────────────────────────────────────
  var reviewForm = document.getElementById('reviewForm');
  if (reviewForm) {
    reviewForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('reviewFormMsg');
      msg.textContent = '';
      msg.className = 'form-msg';

      var name = document.getElementById('reviewName').value.trim();
      var rating = parseInt(document.getElementById('reviewRating').value);
      var comment = document.getElementById('reviewComment').value.trim();

      // Validation
      if (!name) {
        showFormMsg(msg, 'Please enter your name.', 'error');
        return;
      }
      if (!rating || rating < 1 || rating > 5) {
        showFormMsg(msg, 'Please select a rating.', 'error');
        return;
      }
      if (!comment) {
        showFormMsg(msg, 'Please write a review.', 'error');
        return;
      }

      var btn = reviewForm.querySelector('.review-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      fetch(apiBase + '/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, rating: rating, comment: comment })
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Failed'); });
          return res.json();
        })
        .then(function (newReview) {
          showFormMsg(msg, 'Thank you for your review!', 'success');
          reviewForm.reset();
          selectedRating = 0;
          highlightStars(0);

          // Prepend the new review with highlight animation
          var list = document.getElementById('reviewsList');
          var empty = document.getElementById('reviewsEmpty');
          if (empty) empty.style.display = 'none';

          var card = document.createElement('div');
          card.className = 'review-card new-review';
          card.innerHTML =
            '<div class="review-header">' +
              '<span class="review-author">' + escapeHtml(newReview.name) + '</span>' +
              '<span class="review-date">' + formatDate(newReview.createdAt) + '</span>' +
            '</div>' +
            '<div class="review-stars">' + renderStars(newReview.rating) + '</div>' +
            '<p class="review-comment">' + escapeHtml(newReview.comment) + '</p>';

          if (list.firstChild) {
            list.insertBefore(card, list.firstChild);
          } else {
            list.appendChild(card);
          }
        })
        .catch(function (err) {
          showFormMsg(msg, err.message || 'Something went wrong. Please try again.', 'error');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Submit Review';
        });
    });
  }

  // ── Submit product request ──────────────────────────────────
  var requestForm = document.getElementById('productRequestForm');
  if (requestForm) {
    requestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('requestFormMsg');
      msg.textContent = '';
      msg.className = 'form-msg';

      var name = document.getElementById('reqName').value.trim();
      var productName = document.getElementById('reqProduct').value.trim();
      var message = document.getElementById('reqMessage').value.trim();

      if (!name) {
        showFormMsg(msg, 'Please enter your name.', 'error');
        return;
      }
      if (!productName) {
        showFormMsg(msg, 'Please enter the product name.', 'error');
        return;
      }

      var btn = requestForm.querySelector('.request-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      fetch(apiBase + '/api/product-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, productName: productName, message: message })
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Failed'); });
          return res.json();
        })
        .then(function () {
          showFormMsg(msg, 'Request submitted! We\'ll look into stocking this product.', 'success');
          requestForm.reset();
        })
        .catch(function (err) {
          showFormMsg(msg, err.message || 'Something went wrong. Please try again.', 'error');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Send Request';
        });
    });
  }

  // ── Helpers ─────────────────────────────────────────────────
  function showFormMsg(el, text, type) {
    el.textContent = text;
    el.className = 'form-msg ' + type;
  }

  // ── Init ────────────────────────────────────────────────────
  loadReviews();
})();
