const {
    State, Pages, App, UI,
    ORDER_STATUSES, STATUS_CLASSES, RESTAURANT_STATUSES,
    fbUpdateRestaurant, fbUpdateOrder,
    serverTimestamp, FB_CONFIGURED
} = window;

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
        const header = document.getElementById("owner-header");
        if (header) {
            if (r.image) {
                header.classList.add("has-cover");
                header.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.60)), url('${r.image}')`;
            } else {
                header.classList.remove("has-cover");
                header.style.backgroundImage = "";
            }
        }
        if (status === RESTAURANT_STATUSES.approved) { Pages.Owner.renderOrders(); Pages.Owner.renderMenu(); }
    },
    switchTab(tab) { Pages.Owner.currentTab = tab; document.getElementById("seg-orders").classList.toggle("active", tab === "orders"); document.getElementById("seg-menu").classList.toggle("active", tab === "menu"); document.getElementById("owner-orders-tab").style.display = tab === "orders" ? "block" : "none"; document.getElementById("owner-menu-tab").style.display = tab === "menu" ? "block" : "none"; },
    renderOrders() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        const status = r?.status || RESTAURANT_STATUSES.approved;
        if (status !== RESTAURANT_STATUSES.approved) return;
        const list = document.getElementById("owner-orders-list");
        const empty = document.getElementById("owner-orders-empty");
        const active = State.orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled").length;
        const badge = document.getElementById("owner-active-badge");
        if (active > 0) {
            badge.style.display = "inline-block"; badge.className = "badge badge-pending"; badge.style.cssText = "display:inline-block;padding:7px 14px;font-size:13px;font-weight:700;"; badge.style.background = "var(--accent-light)"; badge.style.color = "var(--accent)"; badge.style.borderRadius = "8px"; badge.textContent = `${active} active order${active > 1 ? "s" : ""}`;
        } else { badge.style.display = "none"; }
        const navBadge = document.getElementById("nav-active-orders");
        if (active > 0) { navBadge.style.display = "inline-block"; navBadge.textContent = `${active} active`; } else navBadge.style.display = "none";
        if (!State.orders.length) { list.innerHTML = ""; empty.style.display = "flex"; return; }
        empty.style.display = "none";
        list.innerHTML = State.orders.map(o => { const curIdx = o.statusIndex ?? 0; const date = o.placedAt?.toDate ? o.placedAt.toDate() : new Date(o.placedAt || Date.now()); const canAdvance = o.status !== "Delivered" && o.status !== "Cancelled"; const actions = canAdvance ? ORDER_STATUSES.slice(curIdx + 1).map(s => `<button onclick="Owner.updateStatus('${o.id}','${s}')">${s}</button>`).join("") : ""; return `<div class="order-card"><div class="order-card-head"><div><div class="order-customer">${o.customerName}</div><div class="order-addr">${o.address}</div><div class="order-time">${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div></div><div style="text-align:right;"><span class="badge ${STATUS_CLASSES[o.status] || ""}">${o.status}</span><div class="order-total">$${o.total?.toFixed(2)} · ${o.payment}</div></div></div><div class="order-items-text">${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>${actions ? `<div class="status-actions">${actions}</div>` : ""}</div>`; }).join("");
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
    async resubmitForReview() { const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; try { await fbUpdateRestaurant(r.id, { status: RESTAURANT_STATUSES.pending, resubmittedAt: serverTimestamp() }); r.status = RESTAURANT_STATUSES.pending; Pages.Owner.init(); } catch (e) { Toast.error(e.message || "Could not resubmit for review."); } },
    toggleEditRestaurant() { const panel = document.getElementById("edit-restaurant-panel"); const open = panel.classList.toggle("open"); if (open) { const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; document.getElementById("edit-r-name").value = r.name || ""; document.getElementById("edit-r-cuisine").value = r.cuisine || ""; document.getElementById("edit-r-time").value = r.deliveryTime || ""; document.getElementById("edit-r-fee").value = r.deliveryFee || ""; document.getElementById("edit-r-desc").value = r.description || ""; document.getElementById("edit-r-image").value = r.image || ""; UI.previewImage(document.getElementById("edit-r-image"), "edit-r-preview"); } },
    async saveRestaurant() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return;
        UI.setBtnLoading("save-restaurant-btn", true, "Saving…");
        const data = { name: document.getElementById("edit-r-name").value.trim(), cuisine: document.getElementById("edit-r-cuisine").value.trim(), deliveryTime: document.getElementById("edit-r-time").value.trim(), deliveryFee: parseFloat(document.getElementById("edit-r-fee").value) || 0, description: document.getElementById("edit-r-desc").value.trim(), image: document.getElementById("edit-r-image").value.trim() };
        if ((r.status || RESTAURANT_STATUSES.approved) === RESTAURANT_STATUSES.rejected) { data.status = RESTAURANT_STATUSES.pending; data.resubmittedAt = serverTimestamp(); }
        try { await fbUpdateRestaurant(r.id, data); Object.assign(r, data); Pages.Owner.init(); document.getElementById("edit-restaurant-panel").classList.remove("open"); if (data.status === RESTAURANT_STATUSES.pending) Toast.error("Changes saved and resubmitted for manager review."); } catch (e) { Toast.error(e.message || "Could not save restaurant changes."); } finally { UI.setBtnLoading("save-restaurant-btn", false, "Save changes"); }
    },
    openAddItem() { document.getElementById("add-item-panel").classList.add("open"); },
    closeAddItem() { document.getElementById("add-item-panel").classList.remove("open"); ["new-item-name", "new-item-category", "new-item-price", "new-item-desc", "new-item-image"].forEach(id => document.getElementById(id).value = ""); document.getElementById("new-item-preview").classList.remove("show"); },
    async addMenuItem() { const name = document.getElementById("new-item-name").value.trim(); const price = parseFloat(document.getElementById("new-item-price").value); if (!name || !price) return; const item = { id: "m" + Date.now(), name, price, category: document.getElementById("new-item-category").value.trim(), description: document.getElementById("new-item-desc").value.trim(), image: document.getElementById("new-item-image").value.trim() }; const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; r.menu = [...(r.menu || []), item]; await fbUpdateRestaurant(r.id, { menu: r.menu }); window.Owner.closeAddItem(); Pages.Owner.renderMenu(); },
    openEditItem(itemId) { const r = State.restaurants.find(r => r.ownerId === State.user?.id); const item = r?.menu?.find(i => i.id === itemId); if (!item) return; document.getElementById("edit-item-id").value = item.id; document.getElementById("edit-item-name").value = item.name; document.getElementById("edit-item-category").value = item.category || ""; document.getElementById("edit-item-price").value = item.price; document.getElementById("edit-item-desc").value = item.description || ""; document.getElementById("edit-item-image").value = item.image || ""; UI.previewImage(document.getElementById("edit-item-image"), "edit-item-preview"); document.getElementById("edit-item-panel").classList.add("open"); document.getElementById("add-item-panel").classList.remove("open"); },
    closeEditItem() { document.getElementById("edit-item-panel").classList.remove("open"); },
    async saveItemEdit() { const id = document.getElementById("edit-item-id").value; const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; r.menu = (r.menu || []).map(i => i.id !== id ? i : { ...i, name: document.getElementById("edit-item-name").value.trim(), category: document.getElementById("edit-item-category").value.trim(), price: parseFloat(document.getElementById("edit-item-price").value) || i.price, description: document.getElementById("edit-item-desc").value.trim(), image: document.getElementById("edit-item-image").value.trim(), }); await fbUpdateRestaurant(r.id, { menu: r.menu }); window.Owner.closeEditItem(); Pages.Owner.renderMenu(); },
    async removeItem(itemId) { const r = State.restaurants.find(r => r.ownerId === State.user?.id); if (!r) return; r.menu = (r.menu || []).filter(i => i.id !== itemId); await fbUpdateRestaurant(r.id, { menu: r.menu }); Pages.Owner.renderMenu(); }
};

window.Owner = Pages.Owner;
