const { State, App, Cart, Auth, UI, Rating, Pages, isCustomer, fbSubmitCustomerRating } = window;

Object.assign(Rating, {
    currentOrderId: null,
    isOpen: false,
    hoveredValue: 0,
    open(order) {
        if (!order || !isCustomer() || Rating.isOpen) return;
        Rating.currentOrderId = order.id;
        Rating.hoveredValue = 0;
        const el = document.getElementById("rating-modal");
        const nameEl = document.getElementById("rating-restaurant-name");
        const err = document.getElementById("rating-error");
        if (!el || !nameEl || !err) return;
        err.style.display = "none";
        nameEl.textContent = order.restaurantName || "this restaurant";
        el.style.display = "flex";
        el.setAttribute("aria-hidden", "false");
        Rating.isOpen = true;
        Rating.renderStars(0);
    },
    dismiss() { if (Rating.currentOrderId) { try { localStorage.setItem(`akl_rating_dismissed_${Rating.currentOrderId}`, "1"); } catch { } } Rating.close(); },
    close() { const el = document.getElementById("rating-modal"); if (el) { el.style.display = "none"; el.setAttribute("aria-hidden", "true"); } Rating.isOpen = false; Rating.currentOrderId = null; Rating.hoveredValue = 0; },
    preview(val) { Rating.hoveredValue = val; Rating.renderStars(val); },
    renderStars(val) { const wrap = document.getElementById("rating-stars"); if (!wrap) return; const stars = wrap.querySelectorAll(".star-btn"); stars.forEach((btn, idx) => btn.classList.toggle("active", idx < val)); },
    async submit(val) {
        const err = document.getElementById("rating-error");
        if (!Rating.currentOrderId) return;
        if (err) err.style.display = "none";
        try {
            await fbSubmitCustomerRating(Rating.currentOrderId, val);
            await App.loadRestaurants();
            Rating.close();
        } catch (e) {
            if (err) { err.textContent = e.message || "Could not submit rating."; err.style.display = "block"; }
            else Toast.error(e.message || "Could not submit rating.");
        }
    },
    maybePrompt() {
        if (!isCustomer() || Rating.isOpen) return;
        if (State.currentPage === "login" || State.currentPage === "apply") return;
        const delivered = (State.orders || []).filter(o => o.status === "Delivered");
        if (!delivered.length) return;
        const ratedRestaurantIds = new Set(delivered.filter(o => o.customerRatedAt || o.customerRating).map(o => o.restaurantId).filter(Boolean));
        const candidate = delivered.find(o => {
            if (!o.restaurantId) return false;
            if (ratedRestaurantIds.has(o.restaurantId)) return false;
            if (o.customerRatedAt || o.customerRating) return false;
            try { if (localStorage.getItem(`akl_rating_dismissed_${o.id}`) === "1") return false; } catch { }
            const all = delivered.filter(x => x.restaurantId === o.restaurantId);
            const earliest = all.reduce((min, cur) => {
                const minT = min?.placedAt?.toMillis ? min.placedAt.toMillis() : (min?.placedAt || 0);
                const curT = cur?.placedAt?.toMillis ? cur.placedAt.toMillis() : (cur?.placedAt || 0);
                return curT && (!minT || curT < minT) ? cur : min;
            }, null);
            return earliest?.id === o.id;
        });
        if (candidate) Rating.open(candidate);
    }
});

Object.assign(UI, {
    toggleTheme() { const isDark = document.documentElement.getAttribute("data-theme") === "dark"; UI.applyTheme(!isDark); document.getElementById("setting-dark").checked = !isDark; },
    applyThemeFromToggle(isDark) { UI.applyTheme(isDark); },
    applyTheme(isDark) {
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
        localStorage.setItem("akl-theme", isDark ? "dark" : "light");
        const icon = document.getElementById("theme-icon");
        icon.innerHTML = isDark ? `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>` : `<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>`;
    },
    initTheme() { const saved = localStorage.getItem("akl-theme") || "light"; UI.applyTheme(saved === "dark"); if (saved === "dark") document.getElementById("setting-dark").checked = true; },
    applyUser() {
        const u = State.user;
        document.getElementById("navbar").style.display = u ? "block" : "none";
        if (!u) return;
        document.getElementById("nav-avatar").textContent = u.name?.[0] || "?";
        document.getElementById("nav-username").textContent = u.name?.split(" ")[0] || "";
        document.getElementById("nav-cart-btn").style.display = u.role === "customer" ? "flex" : "none";
        document.getElementById("nav-active-orders").style.display = u.role === "owner" ? "inline-block" : "none";
        document.getElementById("nav-track-btn").style.display = u.role === "customer" ? "flex" : "none";
        document.getElementById("profile-name-display").textContent = u.name || "";
        document.getElementById("profile-avatar-big").textContent = u.name?.[0] || "?";
        document.getElementById("profile-role-badge").textContent = u.role || "";
        UI.updateCartBadge();
    },
    updateCartBadge() { const n = Cart.count; const btn = document.getElementById("nav-cart-btn"); const cnt = document.getElementById("nav-cart-count"); cnt.textContent = n; btn.classList.toggle("empty", n === 0); },
    refreshOrderBadges() { UI.updateCartBadge(); const activeOrders = State.orders.filter(o => o.status !== "Delivered" && o.ownerId === State.user?.id); const nb = document.getElementById("nav-active-orders"); if (State.user?.role === "owner" && activeOrders.length) { nb.textContent = `${activeOrders.length} active`; nb.style.display = "inline-block"; } else nb.style.display = "none"; },
    toggleDropdown() { document.getElementById("profile-dropdown").classList.toggle("open"); },
    closeDropdown() { document.getElementById("profile-dropdown").classList.remove("open"); },
    switchLoginTab(tab) { Auth.currentTab = tab; document.getElementById("tab-login").classList.toggle("active", tab === "login"); document.getElementById("tab-register").classList.toggle("active", tab === "register"); document.getElementById("reg-fields").style.display = tab === "register" ? "block" : "none"; document.getElementById("auth-submit-btn").textContent = tab === "login" ? "Sign in" : "Create account"; UI.setAuthError(""); },
    setAuthError(msg) { const el = document.getElementById("auth-error"); el.textContent = msg; el.style.display = msg ? "block" : "none"; },
    setBtnLoading(id, loading, text) { const btn = document.getElementById(id); if (!btn) return; btn.disabled = loading; btn.innerHTML = loading ? `<span class="spinner"></span> ${text}` : text; },
    previewImage(input, previewId) { const wrap = document.getElementById(previewId); const img = wrap?.querySelector("img"); const url = input?.value?.trim(); if (!url || !wrap || !img) { wrap?.classList.remove("show"); return; } img.src = url; img.onload = () => wrap.classList.add("show"); img.onerror = () => wrap.classList.remove("show"); }
});

document.addEventListener("click", e => {
    const wrap = document.querySelector(".profile-wrap");
    if (wrap && !wrap.contains(e.target)) UI.closeDropdown();
});

