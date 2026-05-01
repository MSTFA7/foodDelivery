const {
    FB_CONFIGURED, State, Pages, App, Cart, Auth, UI, Rating,
    fbGetUser, fbSetUser, fbListenOrders, fbGetRestaurantsForCurrentUser, fbGetRestaurantByOwner,
    fbAddOrder, isManager, isCustomer, isRestaurantApproved, signOut, onAuthStateChanged,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, serverTimestamp
} = window;

Object.assign(Auth, {
    currentTab: "login",

    async submit() {
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value;
        const name = document.getElementById("reg-name").value.trim();
        UI.setAuthError("");
        UI.setBtnLoading("auth-submit-btn", true, Auth.currentTab === "login" ? "Signing in…" : "Creating account…");

        try {
            if (!email || !password) throw new Error("Email and password are required.");
            if (Auth.currentTab === "login") {
                await Auth._login(email, password);
            } else {
                if (!name) throw new Error("Please enter your full name.");
                await Auth._register(name, email, password, "customer");
            }
        } catch (e) {
            UI.setAuthError(e.message || "Something went wrong.");
            UI.setBtnLoading("auth-submit-btn", false, Auth.currentTab === "login" ? "Sign in" : "Create account");
        }
    },

    async _login(email, password) {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. Please add your Firebase config first.");
        const cred = await signInWithEmailAndPassword(window.auth, email, password);
        const profile = await fbGetUser(cred.user.uid);
        if (!profile) throw new Error("User profile not found in Firebase. Please create an account first.");
        await App.setUser(profile);
        UI.setBtnLoading("auth-submit-btn", false, "Sign in");
    },

    async _register(name, email, password, role) {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. Please add your Firebase config first.");
        const cred = await createUserWithEmailAndPassword(window.auth, email, password);
        const profile = { name, email, role, phone: "", address: "", restaurantId: "", createdAt: serverTimestamp() };
        await fbSetUser(cred.user.uid, profile);
        await App.setUser({ id: cred.user.uid, ...profile });
        UI.setBtnLoading("auth-submit-btn", false, "Create account");
    }
});

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

Object.assign(Cart, {
    add(item) {
        const normalized = {
            ...item,
            id: String(item?.id || ""),
            name: item?.name || "Item",
            price: Number(item?.price ?? 0),
            qty: 1,
            restaurantId: item?.restaurantId || "",
            restaurantName: item?.restaurantName || "",
            image: item?.image || ""
        };
        if (!normalized.id) return;

        const ex = State.cart.find(i => i.id === normalized.id);
        if (ex) {
            ex.qty = Number(ex.qty || 0) + 1;
            // Heal older malformed cart rows after refactor
            if (!Number.isFinite(Number(ex.price)) || Number(ex.price) === 0) {
                ex.price = normalized.price;
            }
            if (!ex.name) ex.name = normalized.name;
        } else {
            State.cart.push(normalized);
        }
        UI.updateCartBadge();
        Pages.Restaurant.updateQtyControls();
    },
    updateQty(id, delta) {
        const item = State.cart.find(i => i.id === id);
        if (!item) return;
        item.qty = Number(item.qty || 0) + delta;
        if (item.qty <= 0) State.cart = State.cart.filter(i => i.id !== id);
        UI.updateCartBadge();
        if (State.currentPage === "cart") Pages.Cart.init();
        else Pages.Restaurant.updateQtyControls();
    },
    selectPayment(method) {
        State.cartPayment = method;
        document.getElementById("pay-cash-label").classList.toggle("selected", method === "cash");
        document.getElementById("pay-card-label").classList.toggle("selected", method === "card");
        document.getElementById("card-fields").style.display = method === "card" ? "block" : "none";
    },

    async placeOrder() {
        const restaurant = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
        if (!restaurant || !State.cart.length) return;
        if (isCustomer() && !isRestaurantApproved(restaurant)) {
            alert("This restaurant is not available yet.");
            return;
        }
        UI.setBtnLoading("place-order-btn", true, "Placing order…");
        const orderData = {
            customerId: State.user.id, customerName: State.user.name,
            ownerId: restaurant.ownerId, restaurantId: restaurant.id, restaurantName: restaurant.name,
            items: State.cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, image: i.image || "" })),
            total: parseFloat(Cart.total.toFixed(2)),
            payment: State.cartPayment, status: "Pending", statusIndex: 0,
            address: State.user.address || "No address set",
        };
        await fbAddOrder(orderData);
        State.cart = [];
        UI.updateCartBadge();
        UI.setBtnLoading("place-order-btn", false, "Place order");
        document.getElementById("cart-content").style.display = "none";
        document.getElementById("cart-empty").style.display = "none";
        document.getElementById("cart-success").style.display = "block";
    }
});

Object.defineProperties(Cart, {
    count: {
        get() {
            return State.cart.reduce((a, i) => a + Number(i.qty || 0), 0);
        }
    },
    subtotal: {
        get() {
            return State.cart.reduce((a, i) => a + Number(i.price || 0) * Number(i.qty || 0), 0);
        }
    },
    deliveryFee: {
        get() {
            const r = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
            return Number(r?.deliveryFee || 0);
        }
    },
    total: {
        get() {
            return Cart.subtotal + Cart.deliveryFee;
        }
    }
});

