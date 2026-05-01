const {
    FB_CONFIGURED, State, Pages, App, UI, Rating,
    fbGetUser, fbListenOrders, fbGetRestaurantsForCurrentUser, fbGetRestaurantByOwner,
    isManager, signOut, onAuthStateChanged
} = window;

Object.assign(App, {
    async init() {
        UI.initTheme();
        if (FB_CONFIGURED) {
            onAuthStateChanged(window.auth, async fbUser => {
                if (fbUser) {
                    const profile = await fbGetUser(fbUser.uid);
                    if (profile) { await App.setUser(profile); }
                    else { App.showPage("login"); }
                } else {
                    App.showPage("login");
                }
            });
        } else {
            UI.setAuthError("Firebase is not configured. Add your Firebase config before using the app.");
            App.showPage("login");
        }
    },

    async setUser(profile) {
        State.user = profile;
        UI.applyUser();
        await App.loadRestaurants();

        let target = "home";
        if (profile.role === "manager") {
            target = "manager";
        } else if (profile.role === "owner") {
            let ownerRestaurant = profile.restaurantId
                ? State.restaurants.find(r => r.id === profile.restaurantId)
                : null;

            if (!ownerRestaurant) ownerRestaurant = await fbGetRestaurantByOwner(profile.id);

            if (ownerRestaurant) {
                State.user.restaurantId = ownerRestaurant.id;
                target = "owner";
            } else {
                target = "setup";
            }
        }

        App.startOrderListener();
        App.showPage(target);
    },

    async loadRestaurants() {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. The app now uses Firebase only.");
        State.restaurants = await fbGetRestaurantsForCurrentUser();
    },

    startOrderListener() {
        if (State.unsubOrders) State.unsubOrders();
        if (!State.user) return;
        if (isManager()) return;
        const filter = State.user.role === "customer"
            ? ["customerId", State.user.id]
            : ["ownerId", State.user.id];
        State.unsubOrders = fbListenOrders(filter, orders => {
            State.orders = orders;
            UI.refreshOrderBadges();
            if (State.currentPage === "tracking") Pages.Tracking.render();
            if (State.currentPage === "history") Pages.History.render();
            if (State.currentPage === "owner") Pages.Owner.renderOrders();
            Rating.maybePrompt();
        });
    },

    showPage(page) {
        if (State.currentPage === "manager" && page !== "manager" && Pages.Manager?.unsub) {
            Pages.Manager.unsub();
            Pages.Manager.unsub = null;
        }
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.getElementById("page-" + page)?.classList.add("active");
        State.currentPage = page;
        const pageInits = {
            home: Pages.Home.init,
            restaurant: Pages.Restaurant.init,
            cart: Pages.Cart.init,
            tracking: Pages.Tracking.render,
            history: Pages.History.render,
            profile: Pages.Profile.init,
            owner: Pages.Owner.init,
            manager: Pages.Manager.init,
            setup: () => { },
            settings: Pages.Settings.init,
        };
        pageInits[page]?.();
        window.scrollTo({ top: 0 });
        UI.closeDropdown();
    },

    goHome() {
        if (isManager()) return App.showPage("manager");
        App.showPage(State.user?.role === "owner" ? "owner" : "home");
    },

    async logout() {
        if (State.unsubOrders) State.unsubOrders();
        if (Pages.Manager?.unsub) { Pages.Manager.unsub(); Pages.Manager.unsub = null; }
        State.user = null; State.cart = []; State.orders = []; State.restaurants = [];
        await signOut(window.auth);
        document.getElementById("navbar").style.display = "none";
        App.showPage("login");
    }
});
