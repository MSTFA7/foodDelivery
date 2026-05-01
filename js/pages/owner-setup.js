const {
    State, Pages, App, UI,
    RESTAURANT_STATUSES,
    fbSetUser, fbAddRestaurant, serverTimestamp
} = window;

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
