const {
    State, Pages, ORDER_STATUSES, STATUS_CLASSES,
    fbUpdateOrder, serverTimestamp
} = window;

Pages.Tracking = {
    pendingCancelOrderId: null,
    render() {
        const myOrders = State.orders.filter(o => o.customerId === State.user?.id);
        const order = myOrders[0];
        if (!order) {
            document.getElementById("tracking-empty").style.display = "flex";
            document.getElementById("tracking-content").style.display = "none";
            return;
        }

        document.getElementById("tracking-empty").style.display = "none";
        document.getElementById("tracking-content").style.display = "block";
        document.getElementById("track-restaurant").textContent = order.restaurantName;
        document.getElementById("track-total").textContent = `$${order.total?.toFixed(2)}`;
        document.getElementById("track-status-text").textContent = order.status;

        const bar = document.getElementById("status-bar");
        const isCancelled = order.status === "Cancelled";
        if (isCancelled) {
            bar.innerHTML = `<div class="empty-state" style="padding:12px;"><p>This order was cancelled by customer.</p></div>`;
        } else {
            const idx = order.statusIndex ?? 0;
            bar.innerHTML = ORDER_STATUSES.map((s, i) => `<div class="status-step"><div class="status-line-wrap">${i > 0 ? `<div class="status-line${i <= idx ? " done" : ""}"></div>` : ""}<div class="status-dot${i < idx ? " done" : i === idx ? " current" : ""}">${i < idx ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>` : `<div class="inner"></div>`}</div>${i < ORDER_STATUSES.length - 1 ? `<div class="status-line${i < idx ? " done" : ""}"></div>` : ""}</div><div class="status-label${i <= idx ? " done" : ""}${i === idx ? " current" : ""}">${s}</div></div>`).join("");
        }

        const canCancel = order.status === "Pending";
        const cancelWrap = document.getElementById("track-cancel-wrap");
        if (cancelWrap) cancelWrap.style.display = canCancel ? "block" : "none";

        document.getElementById("track-items-list").innerHTML = (order.items || []).map(item => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>${item.qty}x ${item.name}</span><span style="color:var(--text-sub)">$${(item.price * item.qty).toFixed(2)}</span></div>`).join("");
    },
    cancelCurrentOrder() {
        const myOrders = State.orders.filter(o => o.customerId === State.user?.id);
        const order = myOrders[0];
        if (!order || order.status !== "Pending") {
            Toast.error("Only pending orders can be cancelled.");
            return;
        }
        Pages.Tracking.pendingCancelOrderId = order.id;
        const summary = document.getElementById("cancel-order-summary");
        if (summary) summary.textContent = `${order.restaurantName || "Restaurant"} — $${Number(order.total || 0).toFixed(2)}`;
        const modal = document.getElementById("cancel-order-modal");
        if (modal) {
            modal.style.display = "flex";
            modal.setAttribute("aria-hidden", "false");
        }
    },
    closeCancelModal() {
        Pages.Tracking.pendingCancelOrderId = null;
        const modal = document.getElementById("cancel-order-modal");
        if (modal) {
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }
    },
    async confirmCancelOrder() {
        const orderId = Pages.Tracking.pendingCancelOrderId;
        if (!orderId) return Pages.Tracking.closeCancelModal();
        const order = State.orders.find(o => o.id === orderId);
        if (!order || order.status !== "Pending") {
            Pages.Tracking.closeCancelModal();
            return Toast.error("This order can no longer be cancelled.");
        }

        try {
            await fbUpdateOrder(order.id, { status: "Cancelled", statusIndex: -1, cancelledAt: serverTimestamp() });
            order.status = "Cancelled";
            order.statusIndex = -1;
            Pages.Tracking.closeCancelModal();
            Pages.Tracking.render();
            Pages.History.render();
        } catch (e) {
            Toast.error(e.message || "Could not cancel order.");
        }
    }
};

Pages.History = { render() { const owner = State.user?.role === "owner"; const myRestId = State.restaurants.find(r => r.ownerId === State.user?.id)?.id; const list = owner ? State.orders.filter(o => o.restaurantId === myRestId) : State.orders.filter(o => o.customerId === State.user?.id); if (!list.length) { document.getElementById("history-empty").style.display = "flex"; document.getElementById("history-list").innerHTML = ""; return; } document.getElementById("history-empty").style.display = "none"; document.getElementById("history-list").innerHTML = list.map(o => { const date = o.placedAt?.toDate ? o.placedAt.toDate() : new Date(o.placedAt || Date.now()); return `<div class="history-card"><div class="history-head"><div><h3>${o.restaurantName}</h3>${owner ? `<div class="sub">Customer: ${o.customerName}</div>` : ""}<div class="sub">${date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div><div style="text-align:right;"><span class="badge ${STATUS_CLASSES[o.status] || ""}">${o.status}</span><div class="history-price">$${o.total?.toFixed(2)}</div></div></div><div class="history-items">${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div></div>`; }).join(""); } };
