const {
    State, Pages, App, Cart, Auth, UI,
    ORDER_STATUSES, STATUS_CLASSES, RESTAURANT_STATUSES,
    isCustomer, isManager, isRestaurantApproved,
    fbSetUser, fbAddRestaurant, fbUpdateRestaurant, fbUpdateOrder,
    fbListenRestaurantsByStatus,
    createUserWithEmailAndPassword, serverTimestamp, FB_CONFIGURED, auth
} = window;

Pages.Home = {
    init() { Pages.Home.render(); },
    render() {
        const grid = document.getElementById("restaurant-grid");
        const empty = document.getElementById("restaurant-empty");
        const q = (document.getElementById("search-input")?.value || "").toLowerCase();
        const list = State.restaurants
            .filter(r => !isCustomer() || isRestaurantApproved(r))
            .filter(r => r.name.toLowerCase().includes(q) || (r.cuisine || "").toLowerCase().includes(q));
        if (!list.length) { grid.innerHTML = ""; empty.style.display = "flex"; return; }
        empty.style.display = "none";
        grid.innerHTML = list.map(r => `
      <div class="restaurant-card" onclick="App.showPage('restaurant');Pages.Restaurant.load('${r.id}')">
        <div class="restaurant-card-img">
          ${r.image
                ? `<img src="${r.image}" alt="${r.name}" onerror="this.parentElement.innerHTML='<div class=no-img><svg width=40 height=40 viewBox=&quot;0 0 24 24&quot; fill=none stroke=currentColor stroke-width=1.5><path d=&quot;M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4&quot;/></svg></div>'" />`
                : `<div class="no-img"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg></div>`
            }
          <div class="restaurant-rating">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" stroke-width="1.5"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
            ${(r.rating || 5).toFixed(1)}
          </div>
        </div>
        <div class="restaurant-card-body">
          <div class="restaurant-card-head">
            <h3>${r.name}</h3>
            <span class="cuisine-tag">${r.cuisine || ""}</span>
          </div>
          <p class="restaurant-desc">${r.description || ""}</p>
          <div class="restaurant-meta">
            <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${r.deliveryTime || ""}</span>
            <span>Delivery $${(r.deliveryFee || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>`).join("");
    },
    filter() { Pages.Home.render(); }
};

Pages.Restaurant = {
    restaurant: null,
    load(id) {
        const r = State.restaurants.find(r => r.id === id) || null;
        if (isCustomer() && r && !isRestaurantApproved(r)) {
            alert("This restaurant is not available yet.");
            return App.showPage("home");
        }
        Pages.Restaurant.restaurant = r;
        Pages.Restaurant.init();
    },
    init() {
        const r = Pages.Restaurant.restaurant;
        if (!r) return;
        State.selectedRestaurant = r;
        document.getElementById("rdetail-img").src = r.image || "";
        document.getElementById("rdetail-img").alt = r.name;
        document.getElementById("rdetail-name").textContent = r.name;
        document.getElementById("rdetail-rating-val").textContent = (r.rating || 5).toFixed(1);
        document.getElementById("rdetail-time").textContent = r.deliveryTime || "";
        document.getElementById("rdetail-fee").textContent = `Delivery $${(r.deliveryFee || 0).toFixed(2)}`;
        const categories = [...new Set((r.menu || []).map(i => i.category))];
        State.selectedCategory = categories[0] || "";
        const catBar = document.getElementById("category-bar");
        catBar.innerHTML = categories.map(c =>
            `<button class="cat-btn${c === State.selectedCategory ? " active" : ""}" onclick="Pages.Restaurant.selectCategory('${c}')">${c}</button>`
        ).join("");
        Pages.Restaurant.renderMenu();
    },
    selectCategory(cat) {
        State.selectedCategory = cat;
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("active", b.textContent === cat));
        Pages.Restaurant.renderMenu();
    },
    renderMenu() {
        const r = Pages.Restaurant.restaurant;
        if (!r) return;
        const items = (r.menu || []).filter(i => i.category === State.selectedCategory);
        document.getElementById("menu-list").innerHTML = items.map(item => {
            const qty = (State.cart.find(ci => ci.id === item.id) || {}).qty || 0;
            return `
        <div class="menu-item" id="menu-item-${item.id}">
          <div class="menu-item-img">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='<svg width=24 height=24 viewBox=&quot;0 0 24 24&quot; fill=none stroke=currentColor stroke-width=1.5><path d=&quot;M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z&quot;/></svg>'" />` : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
          </div>
          <div class="menu-item-body">
            <h3>${item.name}</h3>
            <p>${item.description || ""}</p>
            <span class="menu-item-price">$${item.price.toFixed(2)}</span>
          </div>
          <div class="qty-control" id="qty-ctrl-${item.id}">
            ${qty > 0 ? `<button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button><span class="qty-num">${qty}</span>` : ""}
            <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify({ ...item, restaurantId: r.id, restaurantName: r.name }).replace(/"/g, '&quot;')})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
        </div>`;
        }).join("") || `<div class="empty-state"><p>No items in this category</p></div>`;
    },
    updateQtyControls() {
        const r = Pages.Restaurant.restaurant;
        if (!r) return;
        (r.menu || []).filter(i => i.category === State.selectedCategory).forEach(item => {
            const ctrl = document.getElementById("qty-ctrl-" + item.id);
            if (!ctrl) return;
            const qty = (State.cart.find(ci => ci.id === item.id) || {}).qty || 0;
            ctrl.innerHTML = `
        ${qty > 0 ? `<button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button><span class="qty-num">${qty}</span>` : ""}
        <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify({ ...item, restaurantId: r.id, restaurantName: r.name }).replace(/"/g, '&quot;')})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg>
        </button>`;
        });
    }
};

Pages.Cart = {
    init() {
        document.getElementById("cart-success").style.display = "none";
        if (!State.cart.length) {
            document.getElementById("cart-empty").style.display = "flex";
            document.getElementById("cart-content").style.display = "none";
            return;
        }
        document.getElementById("cart-empty").style.display = "none";
        document.getElementById("cart-content").style.display = "block";
        const r = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
        document.getElementById("cart-restaurant-name").textContent = r?.name || "";
        document.getElementById("cart-items-list").innerHTML = State.cart.map(item => {
            const price = Number(item.price || 0);
            const qty = Number(item.qty || 0);
            return `
      <div class="cart-row">
        <div class="cart-row-info"><p>${item.name || "Item"}</p><span>$${price.toFixed(2)} each</span></div>
        <div class="qty-control">
          <button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button>
          <span class="qty-num">${qty}</span>
          <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify(item).replace(/"/g, '&quot;')})"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg></button>
        </div>
        <div class="cart-row-price">$${(price * qty).toFixed(2)}</div>
      </div>`;
        }).join("");
        document.getElementById("cart-subtotal").textContent = `$${Cart.subtotal.toFixed(2)}`;
        document.getElementById("cart-delivery").textContent = `$${Cart.deliveryFee.toFixed(2)}`;
        document.getElementById("cart-total").textContent = `$${Cart.total.toFixed(2)}`;
        document.getElementById("place-order-btn").textContent = `Place order — $${Cart.total.toFixed(2)}`;
    }
};

Pages.Tracking = { /* unchanged logic */ render() { const myOrders = State.orders.filter(o => o.customerId === State.user?.id); const order = myOrders[0]; if (!order) { document.getElementById("tracking-empty").style.display = "flex"; document.getElementById("tracking-content").style.display = "none"; return; } document.getElementById("tracking-empty").style.display = "none"; document.getElementById("tracking-content").style.display = "block"; document.getElementById("track-restaurant").textContent = order.restaurantName; document.getElementById("track-total").textContent = `$${order.total?.toFixed(2)}`; document.getElementById("track-status-text").textContent = order.status; const idx = order.statusIndex ?? 0; const bar = document.getElementById("status-bar"); bar.innerHTML = ORDER_STATUSES.map((s, i) => `<div class="status-step"><div class="status-line-wrap">${i > 0 ? `<div class="status-line${i <= idx ? " done" : ""}"></div>` : ""}<div class="status-dot${i < idx ? " done" : i === idx ? " current" : ""}">${i < idx ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>` : `<div class="inner"></div>`}</div>${i < ORDER_STATUSES.length - 1 ? `<div class="status-line${i < idx ? " done" : ""}"></div>` : ""}</div><div class="status-label${i <= idx ? " done" : ""}${i === idx ? " current" : ""}">${s}</div></div>`).join(""); document.getElementById("track-items-list").innerHTML = (order.items || []).map(item => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>${item.qty}x ${item.name}</span><span style="color:var(--text-sub)">$${(item.price * item.qty).toFixed(2)}</span></div>`).join(""); } };
Pages.History = { render() { const owner = State.user?.role === "owner"; const myRestId = State.restaurants.find(r => r.ownerId === State.user?.id)?.id; const list = owner ? State.orders.filter(o => o.restaurantId === myRestId) : State.orders.filter(o => o.customerId === State.user?.id); if (!list.length) { document.getElementById("history-empty").style.display = "flex"; document.getElementById("history-list").innerHTML = ""; return; } document.getElementById("history-empty").style.display = "none"; document.getElementById("history-list").innerHTML = list.map(o => { const date = o.placedAt?.toDate ? o.placedAt.toDate() : new Date(o.placedAt || Date.now()); return `<div class="history-card"><div class="history-head"><div><h3>${o.restaurantName}</h3>${owner ? `<div class="sub">Customer: ${o.customerName}</div>` : ""}<div class="sub">${date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div><div style="text-align:right;"><span class="badge ${STATUS_CLASSES[o.status] || ""}">${o.status}</span><div class="history-price">$${o.total?.toFixed(2)}</div></div></div><div class="history-items">${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div></div>`; }).join(""); } };

Pages.Profile = {
    init() { const u = State.user; if (!u) return; document.getElementById("prof-name").value = u.name || ""; document.getElementById("prof-email").value = u.email || ""; document.getElementById("prof-phone").value = u.phone || ""; document.getElementById("prof-address").value = u.address || ""; document.getElementById("prof-address-field").style.display = u.role === "customer" ? "block" : "none"; document.getElementById("profile-alert").style.display = "none"; },
    async save() {
        const al = document.getElementById("profile-alert");
        UI.setBtnLoading("prof-save-btn", true, "Saving…");
        try {
            if (!State.user?.id) throw new Error("No logged-in user found.");
            const data = { name: document.getElementById("prof-name").value.trim(), email: document.getElementById("prof-email").value.trim(), phone: document.getElementById("prof-phone").value.trim(), address: document.getElementById("prof-address").value.trim() };
            if (!data.name) throw new Error("Name is required.");
            await fbSetUser(State.user.id, data); Object.assign(State.user, data); UI.applyUser();
            al.className = "alert alert-success"; al.textContent = "Changes saved!"; al.style.display = "block"; setTimeout(() => al.style.display = "none", 2500);
        } catch (e) {
            al.className = "alert alert-error"; al.textContent = e.message || "Could not save profile changes."; al.style.display = "block";
        } finally { UI.setBtnLoading("prof-save-btn", false, "Save changes"); }
    }
};

Pages.Settings = { init() { document.getElementById("setting-dark").checked = document.documentElement.getAttribute("data-theme") === "dark"; } };

Pages.Owner = {
    currentTab: "orders",
    init() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) { App.showPage("setup"); return; }
        const status = r.status || RESTAURANT_STATUSES.approved;
        const tabs = document.querySelector(".segment");
        const ordersTab = document.getElementById("owner-orders-tab");
        const menuTab = document.getElementById("owner-menu-tab");
        if (status !== RESTAURANT_STATUSES.approved) {
            if (tabs) tabs.style.display = "none";
            if (ordersTab) ordersTab.style.display = "block";
            if (menuTab) menuTab.style.display = "none";
            const list = document.getElementById("owner-orders-list");
            const empty = document.getElementById("owner-orders-empty");
            if (empty) empty.style.display = "none";
            if (list) {
                list.innerHTML = `<div class="card"><h3 style="font-size:16px;font-weight:800;margin-bottom:6px;">Restaurant under review</h3><p style="color:var(--text-sub);font-size:13px;line-height:1.6;">Status: <strong>${status}</strong><br/>Customers will only see your restaurant once approved.</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">${status === RESTAURANT_STATUSES.rejected ? `<button class="btn btn-primary" onclick="Owner.resubmitForReview()">Resubmit for review</button>` : ""}<button class="btn btn-secondary" onclick="Owner.toggleEditRestaurant()">Edit details</button></div></div>`;
            }
        } else {
            if (tabs) tabs.style.display = "flex";
            if (ordersTab) ordersTab.style.display = "block";
            if (menuTab) menuTab.style.display = Pages.Owner.currentTab === "menu" ? "block" : "none";
        }
        document.getElementById("owner-restaurant-name").textContent = r.name;
        document.getElementById("owner-restaurant-meta").textContent = `${r.cuisine} · ${r.deliveryTime}`;
        if (status === RESTAURANT_STATUSES.approved) { Pages.Owner.renderOrders(); Pages.Owner.renderMenu(); }
    },
    switchTab(tab) { Pages.Owner.currentTab = tab; document.getElementById("seg-orders").classList.toggle("active", tab === "orders"); document.getElementById("seg-menu").classList.toggle("active", tab === "menu"); document.getElementById("owner-orders-tab").style.display = tab === "orders" ? "block" : "none"; document.getElementById("owner-menu-tab").style.display = tab === "menu" ? "block" : "none"; },
    renderOrders() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        const status = r?.status || RESTAURANT_STATUSES.approved;
        if (status !== RESTAURANT_STATUSES.approved) return;
        const list = document.getElementById("owner-orders-list");
        const empty = document.getElementById("owner-orders-empty");
        const active = State.orders.filter(o => o.status !== "Delivered").length;
        const badge = document.getElementById("owner-active-badge");
        if (active > 0) {
            badge.style.display = "inline-block"; badge.className = "badge badge-pending"; badge.style.cssText = "display:inline-block;padding:7px 14px;font-size:13px;font-weight:700;"; badge.style.background = "var(--accent-light)"; badge.style.color = "var(--accent)"; badge.style.borderRadius = "8px"; badge.textContent = `${active} active order${active > 1 ? "s" : ""}`;
        } else { badge.style.display = "none"; }
        const navBadge = document.getElementById("nav-active-orders");
        if (active > 0) { navBadge.style.display = "inline-block"; navBadge.textContent = `${active} active`; } else navBadge.style.display = "none";
        if (!State.orders.length) { list.innerHTML = ""; empty.style.display = "flex"; return; }
        empty.style.display = "none";
        list.innerHTML = State.orders.map(o => { const curIdx = o.statusIndex ?? 0; const date = o.placedAt?.toDate ? o.placedAt.toDate() : new Date(o.placedAt || Date.now()); const actions = o.status !== "Delivered" ? ORDER_STATUSES.slice(curIdx + 1).map(s => `<button onclick="Owner.updateStatus('${o.id}','${s}')">${s}</button>`).join("") : ""; return `<div class="order-card"><div class="order-card-head"><div><div class="order-customer">${o.customerName}</div><div class="order-addr">${o.address}</div><div class="order-time">${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div></div><div style="text-align:right;"><span class="badge ${STATUS_CLASSES[o.status] || ""}">${o.status}</span><div class="order-total">$${o.total?.toFixed(2)} · ${o.payment}</div></div></div><div class="order-items-text">${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>${actions ? `<div class="status-actions">${actions}</div>` : ""}</div>`; }).join("");
    },
    renderMenu() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        const status = r.status || RESTAURANT_STATUSES.approved;
        if (status !== RESTAURANT_STATUSES.approved) return;
        document.getElementById("menu-count").textContent = `${(r.menu || []).length} item${r.menu?.length !== 1 ? "s" : ""}`;
        document.getElementById("menu-items-list").innerHTML = (r.menu || []).map(item => `<div class="menu-mgr-item"><div class="menu-mgr-img">${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'" />` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}</div><div class="menu-mgr-info"><p>${item.name}</p><small>${item.description || ""} <span style="margin-left:6px;background:var(--surface2);padding:1px 6px;border-radius:4px;font-size:11px;">${item.category || ""}</span></small></div><span class="menu-mgr-price">$${item.price.toFixed(2)}</span><div class="menu-mgr-actions"><button class="btn btn-secondary" style="padding:5px 10px;font-size:12px;" onclick="Owner.openEditItem('${item.id}')">Edit</button><button class="btn btn-danger" style="padding:5px 10px;font-size:12px;" onclick="Owner.removeItem('${item.id}')">Remove</button></div></div>`).join("") || `<div class="empty-state"><p>No menu items yet</p></div>`;
    },
    async updateStatus(orderId, status) { const statusIndex = ORDER_STATUSES.indexOf(status); if (FB_CONFIGURED) await fbUpdateOrder(orderId, { status, statusIndex }); const o = State.orders.find(o => o.id === orderId); if (o) { o.status = status; o.statusIndex = statusIndex; } Pages.Owner.renderOrders(); },
    async resubmitForReview() { const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; try { await fbUpdateRestaurant(r.id, { status: RESTAURANT_STATUSES.pending, resubmittedAt: serverTimestamp() }); r.status = RESTAURANT_STATUSES.pending; Pages.Owner.init(); } catch (e) { alert(e.message || "Could not resubmit for review."); } },
    toggleEditRestaurant() { const panel = document.getElementById("edit-restaurant-panel"); const open = panel.classList.toggle("open"); if (open) { const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; document.getElementById("edit-r-name").value = r.name || ""; document.getElementById("edit-r-cuisine").value = r.cuisine || ""; document.getElementById("edit-r-time").value = r.deliveryTime || ""; document.getElementById("edit-r-fee").value = r.deliveryFee || ""; document.getElementById("edit-r-desc").value = r.description || ""; document.getElementById("edit-r-image").value = r.image || ""; UI.previewImage(document.getElementById("edit-r-image"), "edit-r-preview"); } },
    async saveRestaurant() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return;
        UI.setBtnLoading("save-restaurant-btn", true, "Saving…");
        const data = { name: document.getElementById("edit-r-name").value.trim(), cuisine: document.getElementById("edit-r-cuisine").value.trim(), deliveryTime: document.getElementById("edit-r-time").value.trim(), deliveryFee: parseFloat(document.getElementById("edit-r-fee").value) || 0, description: document.getElementById("edit-r-desc").value.trim(), image: document.getElementById("edit-r-image").value.trim() };
        if ((r.status || RESTAURANT_STATUSES.approved) === RESTAURANT_STATUSES.rejected) { data.status = RESTAURANT_STATUSES.pending; data.resubmittedAt = serverTimestamp(); }
        try { await fbUpdateRestaurant(r.id, data); Object.assign(r, data); Pages.Owner.init(); document.getElementById("edit-restaurant-panel").classList.remove("open"); if (data.status === RESTAURANT_STATUSES.pending) alert("Changes saved and resubmitted for manager review."); } catch (e) { alert(e.message || "Could not save restaurant changes."); } finally { UI.setBtnLoading("save-restaurant-btn", false, "Save changes"); }
    },
    openAddItem() { document.getElementById("add-item-panel").classList.add("open"); },
    closeAddItem() { document.getElementById("add-item-panel").classList.remove("open"); ["new-item-name", "new-item-category", "new-item-price", "new-item-desc", "new-item-image"].forEach(id => document.getElementById(id).value = ""); document.getElementById("new-item-preview").classList.remove("show"); },
    async addMenuItem() { const name = document.getElementById("new-item-name").value.trim(); const price = parseFloat(document.getElementById("new-item-price").value); if (!name || !price) return; const item = { id: "m" + Date.now(), name, price, category: document.getElementById("new-item-category").value.trim(), description: document.getElementById("new-item-desc").value.trim(), image: document.getElementById("new-item-image").value.trim() }; const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; r.menu = [...(r.menu || []), item]; await fbUpdateRestaurant(r.id, { menu: r.menu }); window.Owner.closeAddItem(); Pages.Owner.renderMenu(); },
    openEditItem(itemId) { const r = State.restaurants.find(r => r.ownerId === State.user?.id); const item = r?.menu?.find(i => i.id === itemId); if (!item) return; document.getElementById("edit-item-id").value = item.id; document.getElementById("edit-item-name").value = item.name; document.getElementById("edit-item-category").value = item.category || ""; document.getElementById("edit-item-price").value = item.price; document.getElementById("edit-item-desc").value = item.description || ""; document.getElementById("edit-item-image").value = item.image || ""; UI.previewImage(document.getElementById("edit-item-image"), "edit-item-preview"); document.getElementById("edit-item-panel").classList.add("open"); document.getElementById("add-item-panel").classList.remove("open"); },
    closeEditItem() { document.getElementById("edit-item-panel").classList.remove("open"); },
    async saveItemEdit() { const id = document.getElementById("edit-item-id").value; const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; r.menu = (r.menu || []).map(i => i.id !== id ? i : { ...i, name: document.getElementById("edit-item-name").value.trim(), category: document.getElementById("edit-item-category").value.trim(), price: parseFloat(document.getElementById("edit-item-price").value) || i.price, description: document.getElementById("edit-item-desc").value.trim(), image: document.getElementById("edit-item-image").value.trim(), }); await fbUpdateRestaurant(r.id, { menu: r.menu }); window.Owner.closeEditItem(); Pages.Owner.renderMenu(); },
    async removeItem(itemId) { const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; r.menu = (r.menu || []).filter(i => i.id !== itemId); await fbUpdateRestaurant(r.id, { menu: r.menu }); Pages.Owner.renderMenu(); }
};

Pages.Setup = {
    async create() {
        const name = document.getElementById("setup-name").value.trim();
        const cuisine = document.getElementById("setup-cuisine").value.trim();
        const alertEl = document.getElementById("setup-alert");
        if (!name || !cuisine) { alertEl.className = "alert alert-error"; alertEl.textContent = "Restaurant name and cuisine are required."; alertEl.style.display = "block"; return; }
        alertEl.style.display = "none";
        UI.setBtnLoading("setup-btn", true, "Creating…");
        try {
            if (!State.user?.id) throw new Error("No logged-in user found.");
            const data = { ownerId: State.user.id, name, cuisine, description: document.getElementById("setup-desc").value.trim(), deliveryTime: document.getElementById("setup-time").value || "30-40 min", deliveryFee: parseFloat(document.getElementById("setup-fee").value) || 2.99, image: document.getElementById("setup-image").value.trim(), status: RESTAURANT_STATUSES.pending, rating: 5.0, menu: [], submittedAt: serverTimestamp(), submittedBy: { name: State.user.name || "", email: State.user.email || "", phone: State.user.phone || "", address: State.user.address || "" } };
            const id = await fbAddRestaurant(data);
            await fbSetUser(State.user.id, { restaurantId: id });
            State.user.restaurantId = id;
            await App.loadRestaurants();
            App.showPage("owner");
        } catch (e) { alertEl.className = "alert alert-error"; alertEl.textContent = e.message || "Could not create restaurant."; alertEl.style.display = "block"; } finally { UI.setBtnLoading("setup-btn", false, "Create my restaurant"); }
    }
};

window.Owner = Pages.Owner;

window.Apply = {
    currentStep: 1, formData: {},
    nextStep(step) { if (!window.Apply.validateStep(step)) return; window.Apply.saveStepData(step); window.Apply.currentStep = step + 1; window.Apply.showStep(window.Apply.currentStep); if (window.Apply.currentStep === 4) window.Apply.populateReview(); },
    prevStep(step) { window.Apply.currentStep = step - 1; window.Apply.showStep(window.Apply.currentStep); },
    showStep(stepNum) { document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active')); document.getElementById(`apply-step-${stepNum}`).classList.add('active'); for (let i = 1; i <= 4; i++) { const indicator = document.getElementById(`step-indicator-${i}`); indicator.classList.remove('active', 'completed'); if (i < stepNum) indicator.classList.add('completed'); if (i === stepNum) indicator.classList.add('active'); } document.querySelectorAll('.progress-step.completed .progress-step-circle').forEach(circle => { circle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>'; }); window.scrollTo(0, 0); },
    validateStep(step) { const errorEl = document.getElementById(`apply-error-${step}`); errorEl.style.display = 'none'; if (step === 1) { const name = document.getElementById('apply-restaurant-name').value.trim(); const cuisine = document.getElementById('apply-cuisine').value.trim(); const phone = document.getElementById('apply-phone').value.trim(); const address = document.getElementById('apply-address').value.trim(); if (!name || !cuisine || !phone || !address) { errorEl.textContent = 'Please fill in all required fields.'; errorEl.style.display = 'block'; return false; } } if (step === 2) { const name = document.getElementById('apply-owner-name').value.trim(); const email = document.getElementById('apply-email').value.trim(); const password = document.getElementById('apply-password').value; if (!name || !email || !password) { errorEl.textContent = 'Please fill in all required fields.'; errorEl.style.display = 'block'; return false; } if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.style.display = 'block'; return false; } } return true; },
    saveStepData(step) { if (step === 1) { window.Apply.formData.restaurantName = document.getElementById('apply-restaurant-name').value.trim(); window.Apply.formData.cuisine = document.getElementById('apply-cuisine').value.trim(); window.Apply.formData.phone = document.getElementById('apply-phone').value.trim(); window.Apply.formData.address = document.getElementById('apply-address').value.trim(); window.Apply.formData.description = document.getElementById('apply-description').value.trim(); } if (step === 2) { window.Apply.formData.ownerName = document.getElementById('apply-owner-name').value.trim(); window.Apply.formData.email = document.getElementById('apply-email').value.trim(); window.Apply.formData.password = document.getElementById('apply-password').value; } if (step === 3) { window.Apply.formData.deliveryTime = document.getElementById('apply-delivery-time').value.trim(); window.Apply.formData.deliveryFee = parseFloat(document.getElementById('apply-delivery-fee').value) || 2.99; window.Apply.formData.coverImage = document.getElementById('apply-cover-image').value.trim(); } },
    populateReview() { document.getElementById('review-name').textContent = window.Apply.formData.restaurantName; document.getElementById('review-cuisine').textContent = window.Apply.formData.cuisine; document.getElementById('review-phone').textContent = window.Apply.formData.phone; document.getElementById('review-address').textContent = window.Apply.formData.address; document.getElementById('review-owner').textContent = window.Apply.formData.ownerName; document.getElementById('review-email').textContent = window.Apply.formData.email; document.getElementById('review-time').textContent = window.Apply.formData.deliveryTime; document.getElementById('review-fee').textContent = `$${window.Apply.formData.deliveryFee.toFixed(2)}`; },
    async submit() {
        const errorEl = document.getElementById('apply-error-4'); errorEl.style.display = 'none'; UI.setBtnLoading('apply-submit-btn', true, 'Creating account…');
        try {
            if (!FB_CONFIGURED) throw new Error("Firebase is not configured.");
            const cred = await createUserWithEmailAndPassword(auth, window.Apply.formData.email, window.Apply.formData.password);
            const userProfile = { name: window.Apply.formData.ownerName, email: window.Apply.formData.email, role: 'owner', phone: window.Apply.formData.phone, address: window.Apply.formData.address, restaurantId: '', createdAt: serverTimestamp() };
            await fbSetUser(cred.user.uid, userProfile);
            const restaurantData = { ownerId: cred.user.uid, status: RESTAURANT_STATUSES.pending, name: window.Apply.formData.restaurantName, cuisine: window.Apply.formData.cuisine, address: window.Apply.formData.address, description: window.Apply.formData.description, deliveryTime: window.Apply.formData.deliveryTime, deliveryFee: window.Apply.formData.deliveryFee, image: window.Apply.formData.coverImage, rating: 5.0, submittedAt: serverTimestamp(), submittedBy: { name: window.Apply.formData.ownerName, email: window.Apply.formData.email, phone: window.Apply.formData.phone, address: window.Apply.formData.address }, menu: [] };
            const restaurantId = await fbAddRestaurant(restaurantData);
            await fbSetUser(cred.user.uid, { restaurantId });
            State.user = { id: cred.user.uid, ...userProfile, restaurantId };
            await App.setUser(State.user);
            UI.setBtnLoading('apply-submit-btn', false, 'Submit Application');
            window.Apply.reset();
            App.showPage('owner');
        } catch (e) {
            let msg = e.message || 'Could not create account.';
            if (msg.includes('email-already-in-use')) msg = 'This email is already registered. Try logging in instead.';
            errorEl.textContent = msg; errorEl.style.display = 'block'; UI.setBtnLoading('apply-submit-btn', false, 'Submit Application');
        }
    },
    reset() { window.Apply.currentStep = 1; window.Apply.formData = {}; window.Apply.showStep(1); document.querySelectorAll('#page-apply input').forEach(input => { if (input.type === 'number') input.value = input.defaultValue || ''; else input.value = ''; }); document.querySelectorAll('#page-apply .alert').forEach(alert => { alert.style.display = 'none'; }); }
};

Pages.Manager = {
    unsub: null,
    init() { if (!isManager()) return App.goHome(); if (Pages.Manager.unsub) Pages.Manager.unsub(); Pages.Manager.unsub = fbListenRestaurantsByStatus(RESTAURANT_STATUSES.pending, list => { Pages.Manager.render(list); }); },
    render(list) {
        const empty = document.getElementById("mgr-empty"), wrap = document.getElementById("mgr-list"), badge = document.getElementById("mgr-pending-badge"), n = (list || []).length;
        if (!n) { if (empty) empty.style.display = "flex"; if (wrap) wrap.innerHTML = ""; if (badge) badge.style.display = "none"; return; }
        if (empty) empty.style.display = "none"; if (badge) { badge.style.display = "inline-block"; badge.textContent = `${n} pending`; }
        if (!wrap) return;
        wrap.innerHTML = list.map(r => { const sub = r.submittedBy || {}; const created = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(); const createdText = created ? created.toLocaleString() : ""; return `<div class="order-card"><div class="order-card-head"><div><div class="order-customer">${r.name || "Unnamed restaurant"}</div><div class="order-addr">${r.address || ""}</div><div class="order-time">${createdText}</div><div class="order-items-text" style="margin-top:8px;"><strong>Submitted by</strong>: ${sub.name || "—"} · ${sub.email || "—"} · ${sub.phone || "—"}</div></div><div style="text-align:right;"><span class="badge badge-pending">Pending</span><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;"><button class="btn btn-secondary" style="padding:8px 12px;font-size:13px;" onclick="Pages.Manager.openDetails('${r.id}')">View details</button><button class="btn btn-primary" style="padding:8px 12px;font-size:13px;" onclick="Pages.Manager.approve('${r.id}')">Approve</button><button class="btn btn-danger" style="padding:8px 12px;font-size:13px;" onclick="Pages.Manager.reject('${r.id}')">Reject</button></div></div></div><div class="order-items-text">${r.description || ""}</div></div>`; }).join("");
    },
    openDetails(id) {
        const r = (State.restaurants || []).find(x => x.id === id);
        if (!r) return;
        const submitted = r.submittedBy || {};
        const created = r.createdAt?.toDate ? r.createdAt.toDate() : null;
        const createdText = created ? created.toLocaleString() : "-";

        const setText = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.textContent = val || "-";
        };
        setText("mgrd-name", r.name);
        setText("mgrd-cuisine", r.cuisine);
        setText("mgrd-address", r.address || submitted.address);
        setText("mgrd-phone", submitted.phone);
        setText("mgrd-owner", submitted.name);
        setText("mgrd-email", submitted.email);
        setText("mgrd-time", r.deliveryTime);
        setText("mgrd-fee", typeof r.deliveryFee === "number" ? `$${r.deliveryFee.toFixed(2)}` : "-");
        setText("mgrd-submitted", createdText);
        setText("mgrd-status", r.status || "pending_review");
        setText("mgrd-description", r.description);

        const menuWrap = document.getElementById("mgrd-menu");
        if (menuWrap) {
            const menu = Array.isArray(r.menu) ? r.menu : [];
            menuWrap.innerHTML = menu.length
                ? menu.slice(0, 12).map(item => `<div class="mgrd-menu-item"><strong>${item.name || "Item"}</strong><br/>$${Number(item.price || 0).toFixed(2)} · ${item.category || "General"}${item.description ? `<br/><span style="color:var(--text-sub)">${item.description}</span>` : ""}</div>`).join("")
                : `<div class="mgrd-menu-item">No menu items submitted.</div>`;
        }

        const modal = document.getElementById("manager-details-modal");
        if (modal) {
            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");
        }
    },
    closeDetails() {
        const modal = document.getElementById("manager-details-modal");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }
    },
    async approve(id) { try { await fbUpdateRestaurant(id, { status: RESTAURANT_STATUSES.approved, reviewedAt: serverTimestamp(), reviewedBy: State.user?.id || "" }); await App.loadRestaurants(); } catch (e) { alert(e.message || "Could not approve restaurant."); } },
    async reject(id) { try { await fbUpdateRestaurant(id, { status: RESTAURANT_STATUSES.rejected, reviewedAt: serverTimestamp(), reviewedBy: State.user?.id || "" }); await App.loadRestaurants(); } catch (e) { alert(e.message || "Could not reject restaurant."); } }
};

