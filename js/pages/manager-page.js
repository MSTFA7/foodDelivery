const {
    State, Pages, App,
    RESTAURANT_STATUSES, isManager,
    fbListenRestaurantsByStatus, fbUpdateRestaurant, serverTimestamp
} = window;

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
    async approve(id) { try { await fbUpdateRestaurant(id, { status: RESTAURANT_STATUSES.approved, reviewedAt: serverTimestamp(), reviewedBy: State.user?.id || "" }); await App.loadRestaurants(); } catch (e) { Toast.error(e.message || "Could not approve restaurant."); } },
    async reject(id) { try { await fbUpdateRestaurant(id, { status: RESTAURANT_STATUSES.rejected, reviewedAt: serverTimestamp(), reviewedBy: State.user?.id || "" }); await App.loadRestaurants(); } catch (e) { Toast.error(e.message || "Could not reject restaurant."); } }
};
