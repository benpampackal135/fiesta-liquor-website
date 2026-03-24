# Project: Fiesta Liquor Website

## Overview
Fiesta Liquor is a full-stack liquor delivery/pickup e-commerce web app.

The backend is functional and stable. The current priority is to **modernize and redesign the frontend UI/UX** to feel like a professional, production-grade e-commerce experience.

---

## 🚨 Current Priority (VERY IMPORTANT)

Focus on:
- Modern UI redesign
- Mobile responsiveness
- Cleaner layout and spacing
- Better product browsing experience

Avoid:
- Unnecessary backend changes unless required for UI improvements

---

## Tech Stack
- Backend: Node.js + Express (monolithic `server.js`)
- Frontend: Static HTML, CSS, Vanilla JS
- Data: JSON files (`/data/*.json`)
- Auth: JWT + Firebase
- Payments: Stripe

---

## 🎯 Frontend Goals

Transform the UI to match modern apps like:
- Drizly
- Uber Eats
- DoorDash
- Apple (clean aesthetic)

### Design Requirements
- Mobile-first responsive design
- Clean, minimal layout
- Consistent spacing (8px system)
- Modern typography (larger headings, readable body text)
- Card-based product layout
- Smooth hover effects and transitions
- Sticky/fixed navigation bar
- Clear call-to-action buttons

---

## 🧠 Instructions for Claude

When working on this project:

### UI/UX
- Always prioritize **visual improvements and usability**
- Refactor existing HTML/CSS instead of rewriting everything unless necessary
- Use **flexbox and CSS grid** (avoid outdated layouts)
- Improve spacing, alignment, and hierarchy
- Make everything responsive across screen sizes

### Code Style
- Keep code modular and readable
- Break large UI logic into smaller reusable pieces when possible
- Avoid duplicating logic

### When making changes:
- Explain briefly what is being improved
- Focus on **before vs after improvements**
- Keep designs clean, not overcomplicated

---

## 🔥 High Priority Areas to Improve

1. Navbar (make it modern + sticky)
2. Homepage layout (hero section, categories)
3. Product grid/cards (VERY important)
4. Product detail view
5. Cart + checkout UI
6. Spacing and typography across all pages

---

## 💡 Suggested Enhancements

- Add product filtering and search UI
- Improve category navigation
- Add loading states / skeletons
- Add subtle animations (hover, fade, transitions)
- Improve button styles and consistency

---

## Architecture Notes

- Backend lives in `server.js` (~2,500 lines)
- Data is stored in `/data/*.json`
- Frontend is in `/public/`
- v1 is current production UI
- v2 (`/public/v2/`) is preferred for redesign work

---

## ⚡ How to Approach Changes

- Start with `/public/v2/` when possible
- If improving v1, do so incrementally
- Do NOT break existing API calls
- Always maintain compatibility with current backend

---

## 🧪 Testing

- Test UI on:
  - Mobile (small screens)
  - Tablet
  - Desktop

- Ensure:
  - Buttons are clickable
  - Layout doesn’t break
  - Cart and checkout still work
