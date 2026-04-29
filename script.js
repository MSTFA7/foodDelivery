/* ════════════════════════════════════════════════════
   FIREBASE CONFIG — Firebase-only mode
   Replace these values with your project values if needed.
════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBheLIUcP75VRKNUv55o_rN1mk-ZaMsKZo",
    authDomain: "fooddelivery-cca9b.firebaseapp.com",
    projectId: "fooddelivery-cca9b",
    storageBucket: "fooddelivery-cca9b.firebasestorage.app",
    messagingSenderId: "33163698615",
    appId: "1:33163698615:web:76464e7c92e658b3548832"
};

const FB_CONFIGURED = true;

/* ── Firebase SDK imports ── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, getDocs,
    setDoc, addDoc, updateDoc, query, where,
    orderBy, onSnapshot, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ── Init ── */
const app = FB_CONFIGURED ? initializeApp(FIREBASE_CONFIG) : null;
const auth = FB_CONFIGURED ? getAuth(app) : null;
const db = FB_CONFIGURED ? getFirestore(app) : null;

/* ════════════════════════════════════════════════════
   APP STATE
════════════════════════════════════════════════════ */
const State = {
    user: null,
    restaurants: [],
    cart: [],
    orders: [],
    currentPage: "login",
    selectedRestaurant: null,
    selectedCategory: null,
    unsubOrders: null,
    unsubRestaurants: null,
    cartPayment: "cash",
};

const ORDER_STATUSES = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered"];
const STATUS_CLASSES = { Pending: "badge-pending", Confirmed: "badge-confirmed", Preparing: "badge-preparing", "Out for Delivery": "badge-delivery", Delivered: "badge-delivered" };

const RESTAURANT_STATUSES = {
    pending: "pending_review",
    approved: "approved",
    rejected: "rejected",
};

function isCustomer() { return State.user?.role === "customer"; }
function isOwner() { return State.user?.role === "owner"; }
function isManager() { return State.user?.role === "manager"; }
function isRestaurantApproved(r) { return (r?.status || RESTAURANT_STATUSES.approved) === RESTAURANT_STATUSES.approved; }

/* ════════════════════════════════════════════════════
   FIRESTORE HELPERS
════════════════════════════════════════════════════ */
async function fbGetUser(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
async function fbSetUser(uid, data) {
    await setDoc(doc(db, "users", uid), data, { merge: true });
}
async function fbGetRestaurants() {
    const snap = await getDocs(collection(db, "restaurants"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbGetApprovedRestaurants() {
    const q = query(collection(db, "restaurants"), where("status", "==", RESTAURANT_STATUSES.approved));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbGetRestaurantsForCurrentUser() {
    if (!State.user) return [];

    if (isManager()) {
        return fbGetRestaurants();
    }

    if (isCustomer()) {
        return fbGetApprovedRestaurants();
    }

    if (isOwner()) {
        const approved = await fbGetApprovedRestaurants();
        const own = await fbGetRestaurantByOwner(State.user.id);
        if (!own) return approved;
        const byId = new Map(approved.map(r => [r.id, r]));
        byId.set(own.id, own);
        return Array.from(byId.values());
    }

    return fbGetApprovedRestaurants();
}
async function fbGetRestaurantByOwner(ownerId) {
    const q = query(collection(db, "restaurants"), where("ownerId", "==", ownerId));
    const snap = await getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function fbAddRestaurant(data) {
    const ref = await addDoc(collection(db, "restaurants"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
}
async function fbUpdateRestaurant(id, data) {
    await updateDoc(doc(db, "restaurants", id), data);
}
async function fbAddOrder(data) {
    const ref = await addDoc(collection(db, "orders"), { ...data, placedAt: serverTimestamp() });
    return ref.id;
}
async function fbUpdateOrder(id, data) {
    await updateDoc(doc(db, "orders", id), data);
}
function fbListenOrders(filter, cb) {
    const [field, val] = filter;
    const q = query(collection(db, "orders"), where(field, "==", val), orderBy("placedAt", "desc"));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
function fbListenRestaurants(cb) {
    return onSnapshot(collection(db, "restaurants"), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function fbListenRestaurantsByStatus(status, cb) {
    const q = query(collection(db, "restaurants"), where("status", "==", status));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

async function fbSubmitCustomerRating(orderId, rating) {
    if (!FB_CONFIGURED) throw new Error("Firebase is not configured.");
    if (![1, 2, 3, 4, 5].includes(rating)) throw new Error("Invalid rating.");

    await runTransaction(db, async tx => {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order not found.");
        const order = orderSnap.data();

        if (order.customerId !== State.user?.id) throw new Error("Not allowed.");
        if (order.status !== "Delivered") throw new Error("Order must be delivered first.");
        if (order.customerRatedAt || order.customerRating) throw new Error("Order already rated.");
        if (!order.restaurantId) throw new Error("Order restaurant not found.");

        const restaurantRef = doc(db, "restaurants", order.restaurantId);
        const restSnap = await tx.get(restaurantRef);
        if (!restSnap.exists()) throw new Error("Restaurant not found.");
        const r = restSnap.data();

        const oldSum = typeof r.ratingSum === "number" ? r.ratingSum : 0;
        const oldCount = typeof r.ratingCount === "number" ? r.ratingCount : 0;
        const newSum = oldSum + rating;
        const newCount = oldCount + 1;
        const newAvg = newSum / newCount;

        tx.update(orderRef, { customerRating: rating, customerRatedAt: serverTimestamp() });
        tx.update(restaurantRef, {
            ratingSum: newSum,
            ratingCount: newCount,
            rating: Math.round(newAvg * 10) / 10,
        });
    });
}

/* ════════════════════════════════════════════════════
   AUTH MODULE
════════════════════════════════════════════════════ */
window.Auth = {
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
                await Auth._register(name, email, password, "customer"); // Always customer
            }
        } catch (e) {
            UI.setAuthError(e.message || "Something went wrong.");
            UI.setBtnLoading("auth-submit-btn", false, Auth.currentTab === "login" ? "Sign in" : "Create account");
        }
    },

    async _login(email, password) {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. Please add your Firebase config first.");
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const profile = await fbGetUser(cred.user.uid);
        if (!profile) throw new Error("User profile not found in Firebase. Please create an account first.");
        await App.setUser(profile);
        UI.setBtnLoading("auth-submit-btn", false, "Sign in");
    },

    async _register(name, email, password, role) {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. Please add your Firebase config first.");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const profile = { name, email, role, phone: "", address: "", restaurantId: "", createdAt: serverTimestamp() };
        await fbSetUser(cred.user.uid, profile);
        await App.setUser({ id: cred.user.uid, ...profile });
        UI.setBtnLoading("auth-submit-btn", false, "Create account");
    }
};

/* ════════════════════════════════════════════════════
   MAIN APP MODULE
════════════════════════════════════════════════════ */
window.App = {
    async init() {
        UI.initTheme();
        if (FB_CONFIGURED) {
            onAuthStateChanged(auth, async fbUser => {
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

            if (!ownerRestaurant) {
                ownerRestaurant = State.restaurants.find(r => r.ownerId === profile.id) || null;
            }

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
        await signOut(auth);
        document.getElementById("navbar").style.display = "none";
        App.showPage("login");
    }
};

/* ════════════════════════════════════════════════════
   CART MODULE
════════════════════════════════════════════════════ */
window.Cart = {
    add(item) {
        const ex = State.cart.find(i => i.id === item.id);
        if (ex) ex.qty++;
        else State.cart.push({ ...item, qty: 1 });
        UI.updateCartBadge();
        Pages.Restaurant.updateQtyControls();
    },
    updateQty(id, delta) {
        const item = State.cart.find(i => i.id === id);
        if (!item) return;
        item.qty += delta;
        if (item.qty <= 0) State.cart = State.cart.filter(i => i.id !== id);
        UI.updateCartBadge();
        if (State.currentPage === "cart") Pages.Cart.init();
        else Pages.Restaurant.updateQtyControls();
    },
    get count() { return State.cart.reduce((a, i) => a + i.qty, 0); },
    get subtotal() { return State.cart.reduce((a, i) => a + i.price * i.qty, 0); },
    get deliveryFee() {
        const r = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
        return r?.deliveryFee || 0;
    },
    get total() { return Cart.subtotal + Cart.deliveryFee; },

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
        // Show success
        document.getElementById("cart-content").style.display = "none";
        document.getElementById("cart-empty").style.display = "none";
        document.getElementById("cart-success").style.display = "block";
    }
};

/* ════════════════════════════════════════════════════
   PAGES
════════════════════════════════════════════════════ */
const Pages = {};
window.Pages = Pages;

/* ── HOME ── */
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
            <span>Min. $${r.minOrder || 0}</span>
          </div>
        </div>
      </div>`).join("");
    },
    filter() { Pages.Home.render(); }
};

/* ── RESTAURANT ── */
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

/* ── CART PAGE ── */
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

        document.getElementById("cart-items-list").innerHTML = State.cart.map(item => `
      <div class="cart-row">
        <div class="cart-row-info">
          <p>${item.name}</p>
          <span>$${item.price.toFixed(2)} each</span>
        </div>
        <div class="qty-control">
          <button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button>
          <span class="qty-num">${item.qty}</span>
          <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify(item).replace(/"/g, '&quot;')})"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg></button>
        </div>
        <div class="cart-row-price">$${(item.price * item.qty).toFixed(2)}</div>
      </div>`).join("");

        document.getElementById("cart-subtotal").textContent = `$${Cart.subtotal.toFixed(2)}`;
        document.getElementById("cart-delivery").textContent = `$${Cart.deliveryFee.toFixed(2)}`;
        document.getElementById("cart-total").textContent = `$${Cart.total.toFixed(2)}`;
        document.getElementById("place-order-btn").textContent = `Place order — $${Cart.total.toFixed(2)}`;
    }
};

/* ── TRACKING ── */
Pages.Tracking = {
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

        const idx = order.statusIndex ?? 0;
        const bar = document.getElementById("status-bar");
        bar.innerHTML = ORDER_STATUSES.map((s, i) => `
      <div class="status-step">
        <div class="status-line-wrap">
          ${i > 0 ? `<div class="status-line${i <= idx ? " done" : ""}"></div>` : ""}
          <div class="status-dot${i < idx ? " done" : i === idx ? " current" : ""}">
            ${i < idx ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>` : `<div class="inner"></div>`}
          </div>
          ${i < ORDER_STATUSES.length - 1 ? `<div class="status-line${i < idx ? " done" : ""}"></div>` : ""}
        </div>
        <div class="status-label${i <= idx ? " done" : ""}${i === idx ? " current" : ""}">${s}</div>
      </div>`).join("");

        document.getElementById("track-items-list").innerHTML = (order.items || []).map(item => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${item.qty}x ${item.name}</span>
        <span style="color:var(--text-sub)">$${(item.price * item.qty).toFixed(2)}</span>
      </div>`).join("");
    }
};

/* ── HISTORY ── */
Pages.History = {
    render() {
        const isOwner = State.user?.role === "owner";
        const myRestId = State.restaurants.find(r => r.ownerId === State.user?.id)?.id;
        const list = isOwner
            ? State.orders.filter(o => o.restaurantId === myRestId)
            : State.orders.filter(o => o.customerId === State.user?.id);

        if (!list.length) {
            document.getElementById("history-empty").style.display = "flex";
            document.getElementById("history-list").innerHTML = "";
            return;
        }
        document.getElementById("history-empty").style.display = "none";
        document.getElementById("history-list").innerHTML = list.map(o => {
            const date = o.placedAt?.toDate ? o.placedAt.toDate() : new Date(o.placedAt || Date.now());
            return `
        <div class="history-card">
          <div class="history-head">
            <div>
              <h3>${o.restaurantName}</h3>
              ${isOwner ? `<div class="sub">Customer: ${o.customerName}</div>` : ""}
              <div class="sub">${date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <div style="text-align:right;">
              <span class="badge ${STATUS_CLASSES[o.status] || ""}">${o.status}</span>
              <div class="history-price">$${o.total?.toFixed(2)}</div>
            </div>
          </div>
          <div class="history-items">${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
        </div>`;
        }).join("");
    }
};

/* ── PROFILE ── */
Pages.Profile = {
    init() {
        const u = State.user;
        if (!u) return;
        document.getElementById("prof-name").value = u.name || "";
        document.getElementById("prof-email").value = u.email || "";
        document.getElementById("prof-phone").value = u.phone || "";
        document.getElementById("prof-address").value = u.address || "";
        document.getElementById("prof-address-field").style.display = u.role === "customer" ? "block" : "none";
        document.getElementById("profile-alert").style.display = "none";
    },
    async save() {
        const al = document.getElementById("profile-alert");
        UI.setBtnLoading("prof-save-btn", true, "Saving…");
        try {
            if (!State.user?.id) throw new Error("No logged-in user found.");
            const data = {
                name: document.getElementById("prof-name").value.trim(),
                email: document.getElementById("prof-email").value.trim(),
                phone: document.getElementById("prof-phone").value.trim(),
                address: document.getElementById("prof-address").value.trim(),
            };
            if (!data.name) throw new Error("Name is required.");
            await fbSetUser(State.user.id, data);
            Object.assign(State.user, data);
            UI.applyUser();
            al.className = "alert alert-success";
            al.textContent = "Changes saved!";
            al.style.display = "block";
            setTimeout(() => al.style.display = "none", 2500);
        } catch (e) {
            al.className = "alert alert-error";
            al.textContent = e.message || "Could not save profile changes.";
            al.style.display = "block";
            console.error("Profile save failed:", e);
        } finally {
            UI.setBtnLoading("prof-save-btn", false, "Save changes");
        }
    }
};

/* ── SETTINGS ── */
Pages.Settings = {
    init() {
        document.getElementById("setting-dark").checked = document.documentElement.getAttribute("data-theme") === "dark";
    }
};

/* ── OWNER ── */
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
                list.innerHTML = `
                  <div class="card">
                    <h3 style="font-size:16px;font-weight:800;margin-bottom:6px;">Restaurant under review</h3>
                    <p style="color:var(--text-sub);font-size:13px;line-height:1.6;">
                      Status: <strong>${status}</strong><br/>
                      Customers will only see your restaurant once approved.
                    </p>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
                      ${status === RESTAURANT_STATUSES.rejected ? `<button class="btn btn-primary" onclick="Owner.resubmitForReview()">Resubmit for review</button>` : ""}
                      <button class="btn btn-secondary" onclick="Owner.toggleEditRestaurant()">Edit details</button>
                    </div>
                  </div>
                `;
            }
        } else {
            if (tabs) tabs.style.display = "flex";
            if (ordersTab) ordersTab.style.display = "block";
            if (menuTab) menuTab.style.display = Pages.Owner.currentTab === "menu" ? "block" : "none";
        }

        document.getElementById("owner-restaurant-name").textContent = r.name;
        document.getElementById("owner-restaurant-meta").textContent = `${r.cuisine} · ${r.deliveryTime}`;
        if (status === RESTAURANT_STATUSES.approved) {
            Pages.Owner.renderOrders();
            Pages.Owner.renderMenu();
        }
    },

    switchTab(tab) {
        Pages.Owner.currentTab = tab;
        document.getElementById("seg-orders").classList.toggle("active", tab === "orders");
        document.getElementById("seg-menu").classList.toggle("active", tab === "menu");
        document.getElementById("owner-orders-tab").style.display = tab === "orders" ? "block" : "none";
        document.getElementById("owner-menu-tab").style.display = tab === "menu" ? "block" : "none";
    },

    renderOrders() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        const status = r?.status || RESTAURANT_STATUSES.approved;
        if (status !== RESTAURANT_STATUSES.approved) return;

        const list = document.getElementById("owner-orders-list");
        const empty = document.getElementById("owner-orders-empty");
        const active = State.orders.filter(o => o.status !== "Delivered").length;

        const badge = document.getElementById("owner-active-badge");
        if (active > 0) {
            badge.style.display = "inline-block";
            badge.className = "badge badge-pending";
            badge.style.cssText = "display:inline-block;padding:7px 14px;font-size:13px;font-weight:700;";
            badge.style.background = "var(--accent-light)"; badge.style.color = "var(--accent)"; badge.style.borderRadius = "8px";
            badge.textContent = `${active} active order${active > 1 ? "s" : ""}`;
        } else { badge.style.display = "none"; }

        const navBadge = document.getElementById("nav-active-orders");
        if (active > 0) { navBadge.style.display = "inline-block"; navBadge.textContent = `${active} active`; }
        else navBadge.style.display = "none";

        if (!State.orders.length) { list.innerHTML = ""; empty.style.display = "flex"; return; }
        empty.style.display = "none";
        list.innerHTML = State.orders.map(o => {
            const curIdx = o.statusIndex ?? 0;
            const date = o.placedAt?.toDate ? o.placedAt.toDate() : new Date(o.placedAt || Date.now());
            const actions = o.status !== "Delivered"
                ? ORDER_STATUSES.slice(curIdx + 1).map(s => `<button onclick="Owner.updateStatus('${o.id}','${s}')">${s}</button>`).join("")
                : "";
            return `
        <div class="order-card">
          <div class="order-card-head">
            <div>
              <div class="order-customer">${o.customerName}</div>
              <div class="order-addr">${o.address}</div>
              <div class="order-time">${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <div style="text-align:right;">
              <span class="badge ${STATUS_CLASSES[o.status] || ""}">${o.status}</span>
              <div class="order-total">$${o.total?.toFixed(2)} · ${o.payment}</div>
            </div>
          </div>
          <div class="order-items-text">${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(", ")}</div>
          ${actions ? `<div class="status-actions">${actions}</div>` : ""}
        </div>`;
        }).join("");
    },

    renderMenu() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        const status = r.status || RESTAURANT_STATUSES.approved;
        if (status !== RESTAURANT_STATUSES.approved) return;
        document.getElementById("menu-count").textContent = `${(r.menu || []).length} item${r.menu?.length !== 1 ? "s" : ""}`;
        document.getElementById("menu-items-list").innerHTML = (r.menu || []).map(item => `
      <div class="menu-mgr-item">
        <div class="menu-mgr-img">
          ${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.style.display='none'" />` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
        </div>
        <div class="menu-mgr-info">
          <p>${item.name}</p>
          <small>${item.description || ""} <span style="margin-left:6px;background:var(--surface2);padding:1px 6px;border-radius:4px;font-size:11px;">${item.category || ""}</span></small>
        </div>
        <span class="menu-mgr-price">$${item.price.toFixed(2)}</span>
        <div class="menu-mgr-actions">
          <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px;" onclick="Owner.openEditItem('${item.id}')">Edit</button>
          <button class="btn btn-danger" style="padding:5px 10px;font-size:12px;" onclick="Owner.removeItem('${item.id}')">Remove</button>
        </div>
      </div>`).join("") || `<div class="empty-state"><p>No menu items yet</p></div>`;
    },

    async updateStatus(orderId, status) {
        const statusIndex = ORDER_STATUSES.indexOf(status);
        if (FB_CONFIGURED) await fbUpdateOrder(orderId, { status, statusIndex });
        const o = State.orders.find(o => o.id === orderId);
        if (o) { o.status = status; o.statusIndex = statusIndex; }
        Pages.Owner.renderOrders();
    },

    async resubmitForReview() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        try {
            await fbUpdateRestaurant(r.id, { status: RESTAURANT_STATUSES.pending, resubmittedAt: serverTimestamp() });
            r.status = RESTAURANT_STATUSES.pending;
            Pages.Owner.init();
        } catch (e) {
            alert(e.message || "Could not resubmit for review.");
        }
    },

    toggleEditRestaurant() {
        const panel = document.getElementById("edit-restaurant-panel");
        const open = panel.classList.toggle("open");
        if (open) {
            const r = State.restaurants.find(r => r.ownerId === State.user?.id);
            if (!r) return;
            document.getElementById("edit-r-name").value = r.name || "";
            document.getElementById("edit-r-cuisine").value = r.cuisine || "";
            document.getElementById("edit-r-time").value = r.deliveryTime || "";
            document.getElementById("edit-r-fee").value = r.deliveryFee || "";
            document.getElementById("edit-r-desc").value = r.description || "";
            document.getElementById("edit-r-image").value = r.image || "";
            UI.previewImage(document.getElementById("edit-r-image"), "edit-r-preview");
        }
    },

    async saveRestaurant() {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        UI.setBtnLoading("save-restaurant-btn", true, "Saving…");
        const data = {
            name: document.getElementById("edit-r-name").value.trim(),
            cuisine: document.getElementById("edit-r-cuisine").value.trim(),
            deliveryTime: document.getElementById("edit-r-time").value.trim(),
            deliveryFee: parseFloat(document.getElementById("edit-r-fee").value) || 0,
            description: document.getElementById("edit-r-desc").value.trim(),
            image: document.getElementById("edit-r-image").value.trim(),
        };
        // Rejected restaurants are resubmitted automatically when owner saves edits.
        if ((r.status || RESTAURANT_STATUSES.approved) === RESTAURANT_STATUSES.rejected) {
            data.status = RESTAURANT_STATUSES.pending;
            data.resubmittedAt = serverTimestamp();
        }
        try {
            await fbUpdateRestaurant(r.id, data);
            Object.assign(r, data);
            Pages.Owner.init();
            document.getElementById("edit-restaurant-panel").classList.remove("open");
            if (data.status === RESTAURANT_STATUSES.pending) {
                alert("Changes saved and resubmitted for manager review.");
            }
        } catch (e) {
            alert(e.message || "Could not save restaurant changes.");
            console.error("Restaurant save failed:", e);
        } finally {
            UI.setBtnLoading("save-restaurant-btn", false, "Save changes");
        }
    },

    openAddItem() { document.getElementById("add-item-panel").classList.add("open"); },
    closeAddItem() {
        document.getElementById("add-item-panel").classList.remove("open");
        ["new-item-name", "new-item-category", "new-item-price", "new-item-desc", "new-item-image"].forEach(id => document.getElementById(id).value = "");
        document.getElementById("new-item-preview").classList.remove("show");
    },

    async addMenuItem() {
        const name = document.getElementById("new-item-name").value.trim();
        const price = parseFloat(document.getElementById("new-item-price").value);
        if (!name || !price) return;
        const item = {
            id: "m" + Date.now(), name, price,
            category: document.getElementById("new-item-category").value.trim(),
            description: document.getElementById("new-item-desc").value.trim(),
            image: document.getElementById("new-item-image").value.trim(),
        };
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        r.menu = [...(r.menu || []), item];
        await fbUpdateRestaurant(r.id, { menu: r.menu });
        Owner.closeAddItem();
        Pages.Owner.renderMenu();
    },

    openEditItem(itemId) {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        const item = r?.menu?.find(i => i.id === itemId);
        if (!item) return;
        document.getElementById("edit-item-id").value = item.id;
        document.getElementById("edit-item-name").value = item.name;
        document.getElementById("edit-item-category").value = item.category || "";
        document.getElementById("edit-item-price").value = item.price;
        document.getElementById("edit-item-desc").value = item.description || "";
        document.getElementById("edit-item-image").value = item.image || "";
        UI.previewImage(document.getElementById("edit-item-image"), "edit-item-preview");
        document.getElementById("edit-item-panel").classList.add("open");
        document.getElementById("add-item-panel").classList.remove("open");
    },
    closeEditItem() { document.getElementById("edit-item-panel").classList.remove("open"); },

    async saveItemEdit() {
        const id = document.getElementById("edit-item-id").value;
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        r.menu = (r.menu || []).map(i => i.id !== id ? i : {
            ...i,
            name: document.getElementById("edit-item-name").value.trim(),
            category: document.getElementById("edit-item-category").value.trim(),
            price: parseFloat(document.getElementById("edit-item-price").value) || i.price,
            description: document.getElementById("edit-item-desc").value.trim(),
            image: document.getElementById("edit-item-image").value.trim(),
        });
        await fbUpdateRestaurant(r.id, { menu: r.menu });
        Owner.closeEditItem();
        Pages.Owner.renderMenu();
    },

    async removeItem(itemId) {
        const r = State.restaurants.find(r => r.ownerId === State.user?.id);
        if (!r) return;
        r.menu = (r.menu || []).filter(i => i.id !== itemId);
        await fbUpdateRestaurant(r.id, { menu: r.menu });
        Pages.Owner.renderMenu();
    }
};

/* ── SETUP ── */
Pages.Setup = {
    async create() {
        const name = document.getElementById("setup-name").value.trim();
        const cuisine = document.getElementById("setup-cuisine").value.trim();
        const alert = document.getElementById("setup-alert");
        if (!name || !cuisine) {
            alert.className = "alert alert-error";
            alert.textContent = "Restaurant name and cuisine are required.";
            alert.style.display = "block";
            return;
        }
        alert.style.display = "none";
        UI.setBtnLoading("setup-btn", true, "Creating…");
        try {
            if (!State.user?.id) throw new Error("No logged-in user found.");
            const data = {
                ownerId: State.user.id, name, cuisine,
                description: document.getElementById("setup-desc").value.trim(),
                deliveryTime: document.getElementById("setup-time").value || "30-40 min",
                deliveryFee: parseFloat(document.getElementById("setup-fee").value) || 2.99,
                minOrder: parseFloat(document.getElementById("setup-min").value) || 15,
                image: document.getElementById("setup-image").value.trim(),
                status: RESTAURANT_STATUSES.pending,
                rating: 5.0, menu: [],
                submittedAt: serverTimestamp(),
                submittedBy: {
                    name: State.user.name || "",
                    email: State.user.email || "",
                    phone: State.user.phone || "",
                    address: State.user.address || "",
                },
            };
            const id = await fbAddRestaurant(data);
            await fbSetUser(State.user.id, { restaurantId: id });
            State.user.restaurantId = id;
            await App.loadRestaurants();
            App.showPage("owner");
        } catch (e) {
            alert.className = "alert alert-error";
            alert.textContent = e.message || "Could not create restaurant.";
            alert.style.display = "block";
            console.error("Restaurant setup failed:", e);
        } finally {
            UI.setBtnLoading("setup-btn", false, "Create my restaurant");
        }
    }
};

/* ══ Expose Owner globally ══ */
window.Owner = Pages.Owner;

/* ════════════════════════════════════════════════════
   APPLY / ONBOARDING MODULE
════════════════════════════════════════════════════ */
window.Apply = {
    currentStep: 1,
    formData: {},

    nextStep(step) {
        // Validate current step
        if (!Apply.validateStep(step)) return;

        // Save data from current step
        Apply.saveStepData(step);

        // Move to next step
        Apply.currentStep = step + 1;
        Apply.showStep(Apply.currentStep);

        // Update review if on final step
        if (Apply.currentStep === 4) {
            Apply.populateReview();
        }
    },

    prevStep(step) {
        Apply.currentStep = step - 1;
        Apply.showStep(Apply.currentStep);
    },

    showStep(stepNum) {
        // Hide all steps
        document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
        // Show current step
        document.getElementById(`apply-step-${stepNum}`).classList.add('active');

        // Update progress indicators
        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`step-indicator-${i}`);
            indicator.classList.remove('active', 'completed');
            if (i < stepNum) indicator.classList.add('completed');
            if (i === stepNum) indicator.classList.add('active');
        }

        // Update completed step circles with checkmark
        document.querySelectorAll('.progress-step.completed .progress-step-circle').forEach(circle => {
            circle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
        });

        // Scroll to top
        window.scrollTo(0, 0);
    },

    validateStep(step) {
        const errorEl = document.getElementById(`apply-error-${step}`);
        errorEl.style.display = 'none';

        if (step === 1) {
            const name = document.getElementById('apply-restaurant-name').value.trim();
            const cuisine = document.getElementById('apply-cuisine').value.trim();
            const phone = document.getElementById('apply-phone').value.trim();
            const address = document.getElementById('apply-address').value.trim();

            if (!name || !cuisine || !phone || !address) {
                errorEl.textContent = 'Please fill in all required fields.';
                errorEl.style.display = 'block';
                return false;
            }
        }

        if (step === 2) {
            const name = document.getElementById('apply-owner-name').value.trim();
            const email = document.getElementById('apply-email').value.trim();
            const password = document.getElementById('apply-password').value;

            if (!name || !email || !password) {
                errorEl.textContent = 'Please fill in all required fields.';
                errorEl.style.display = 'block';
                return false;
            }

            if (password.length < 6) {
                errorEl.textContent = 'Password must be at least 6 characters.';
                errorEl.style.display = 'block';
                return false;
            }
        }

        return true;
    },

    saveStepData(step) {
        if (step === 1) {
            Apply.formData.restaurantName = document.getElementById('apply-restaurant-name').value.trim();
            Apply.formData.cuisine = document.getElementById('apply-cuisine').value.trim();
            Apply.formData.phone = document.getElementById('apply-phone').value.trim();
            Apply.formData.address = document.getElementById('apply-address').value.trim();
            Apply.formData.description = document.getElementById('apply-description').value.trim();
        }

        if (step === 2) {
            Apply.formData.ownerName = document.getElementById('apply-owner-name').value.trim();
            Apply.formData.email = document.getElementById('apply-email').value.trim();
            Apply.formData.password = document.getElementById('apply-password').value;
        }

        if (step === 3) {
            Apply.formData.deliveryTime = document.getElementById('apply-delivery-time').value.trim();
            Apply.formData.deliveryFee = parseFloat(document.getElementById('apply-delivery-fee').value) || 2.99;
            Apply.formData.minOrder = parseFloat(document.getElementById('apply-min-order').value) || 15;
            Apply.formData.coverImage = document.getElementById('apply-cover-image').value.trim();
        }
    },

    populateReview() {
        document.getElementById('review-name').textContent = Apply.formData.restaurantName;
        document.getElementById('review-cuisine').textContent = Apply.formData.cuisine;
        document.getElementById('review-phone').textContent = Apply.formData.phone;
        document.getElementById('review-address').textContent = Apply.formData.address;
        document.getElementById('review-owner').textContent = Apply.formData.ownerName;
        document.getElementById('review-email').textContent = Apply.formData.email;
        document.getElementById('review-time').textContent = Apply.formData.deliveryTime;
        document.getElementById('review-fee').textContent = `$${Apply.formData.deliveryFee.toFixed(2)}`;
        document.getElementById('review-min').textContent = `$${Apply.formData.minOrder.toFixed(2)}`;
    },

    async submit() {
        const errorEl = document.getElementById('apply-error-4');
        errorEl.style.display = 'none';
        UI.setBtnLoading('apply-submit-btn', true, 'Creating account…');

        try {
            if (!FB_CONFIGURED) throw new Error("Firebase is not configured.");

            // 1. Create auth account
            const cred = await createUserWithEmailAndPassword(
                auth,
                Apply.formData.email,
                Apply.formData.password
            );

            // 2. Create user profile as owner
            const userProfile = {
                name: Apply.formData.ownerName,
                email: Apply.formData.email,
                role: 'owner',
                phone: Apply.formData.phone,
                address: Apply.formData.address,
                restaurantId: '',
                createdAt: serverTimestamp()
            };
            await fbSetUser(cred.user.uid, userProfile);

            // 3. Create restaurant
            const restaurantData = {
                ownerId: cred.user.uid,
                status: RESTAURANT_STATUSES.pending,
                name: Apply.formData.restaurantName,
                cuisine: Apply.formData.cuisine,
                address: Apply.formData.address,
                description: Apply.formData.description,
                deliveryTime: Apply.formData.deliveryTime,
                deliveryFee: Apply.formData.deliveryFee,
                minOrder: Apply.formData.minOrder,
                image: Apply.formData.coverImage,
                rating: 5.0,
                submittedAt: serverTimestamp(),
                submittedBy: {
                    name: Apply.formData.ownerName,
                    email: Apply.formData.email,
                    phone: Apply.formData.phone,
                    address: Apply.formData.address,
                },
                menu: []
            };
            const restaurantId = await fbAddRestaurant(restaurantData);

            // 4. Link restaurant to user
            await fbSetUser(cred.user.uid, { restaurantId });

            // 5. Set user and navigate
            State.user = { id: cred.user.uid, ...userProfile, restaurantId };
            await App.setUser(State.user);

            UI.setBtnLoading('apply-submit-btn', false, 'Submit Application');
            Apply.reset();
            App.showPage('owner');

        } catch (e) {
            let msg = e.message || 'Could not create account.';
            if (msg.includes('email-already-in-use')) {
                msg = 'This email is already registered. Try logging in instead.';
            }
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
            UI.setBtnLoading('apply-submit-btn', false, 'Submit Application');
            console.error('Application error:', e);
        }
    },

    reset() {
        Apply.currentStep = 1;
        Apply.formData = {};
        Apply.showStep(1);
        // Clear all form fields
        document.querySelectorAll('#page-apply input').forEach(input => {
            if (input.type === 'number') {
                input.value = input.defaultValue || '';
            } else {
                input.value = '';
            }
        });
        document.querySelectorAll('#page-apply .alert').forEach(alert => {
            alert.style.display = 'none';
        });
    }
};

/* ── MANAGER ── */
Pages.Manager = {
    unsub: null,
    init() {
        if (!isManager()) return App.goHome();
        if (Pages.Manager.unsub) Pages.Manager.unsub();

        Pages.Manager.unsub = fbListenRestaurantsByStatus(RESTAURANT_STATUSES.pending, list => {
            Pages.Manager.render(list);
        });
    },

    render(list) {
        const empty = document.getElementById("mgr-empty");
        const wrap = document.getElementById("mgr-list");
        const badge = document.getElementById("mgr-pending-badge");
        const n = (list || []).length;

        if (!n) {
            if (empty) empty.style.display = "flex";
            if (wrap) wrap.innerHTML = "";
            if (badge) badge.style.display = "none";
            return;
        }

        if (empty) empty.style.display = "none";
        if (badge) { badge.style.display = "inline-block"; badge.textContent = `${n} pending`; }

        if (!wrap) return;
        wrap.innerHTML = list.map(r => {
            const sub = r.submittedBy || {};
            const created = r.createdAt?.toDate ? r.createdAt.toDate() : null;
            const createdText = created ? created.toLocaleString() : "";
            return `
              <div class="order-card">
                <div class="order-card-head">
                  <div>
                    <div class="order-customer">${r.name || "Unnamed restaurant"}</div>
                    <div class="order-addr">${r.address || ""}</div>
                    <div class="order-time">${createdText}</div>
                    <div class="order-items-text" style="margin-top:8px;">
                      <strong>Submitted by</strong>: ${sub.name || "—"} · ${sub.email || "—"} · ${sub.phone || "—"}
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <span class="badge badge-pending">Pending</span>
                    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;">
                      <button class="btn btn-primary" style="padding:8px 12px;font-size:13px;" onclick="Pages.Manager.approve('${r.id}')">Approve</button>
                      <button class="btn btn-danger" style="padding:8px 12px;font-size:13px;" onclick="Pages.Manager.reject('${r.id}')">Reject</button>
                    </div>
                  </div>
                </div>
                <div class="order-items-text">${r.description || ""}</div>
              </div>
            `;
        }).join("");
    },

    async approve(id) {
        try {
            await fbUpdateRestaurant(id, { status: RESTAURANT_STATUSES.approved, reviewedAt: serverTimestamp(), reviewedBy: State.user?.id || "" });
            await App.loadRestaurants();
        } catch (e) {
            alert(e.message || "Could not approve restaurant.");
        }
    },

    async reject(id) {
        try {
            await fbUpdateRestaurant(id, { status: RESTAURANT_STATUSES.rejected, reviewedAt: serverTimestamp(), reviewedBy: State.user?.id || "" });
            await App.loadRestaurants();
        } catch (e) {
            alert(e.message || "Could not reject restaurant.");
        }
    }
};

/* ── RATING PROMPT ── */
window.Rating = {
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

    dismiss() {
        if (Rating.currentOrderId) {
            try { localStorage.setItem(`tafa7ny_rating_dismissed_${Rating.currentOrderId}`, "1"); } catch { }
        }
        Rating.close();
    },

    close() {
        const el = document.getElementById("rating-modal");
        if (el) {
            el.style.display = "none";
            el.setAttribute("aria-hidden", "true");
        }
        Rating.isOpen = false;
        Rating.currentOrderId = null;
        Rating.hoveredValue = 0;
    },

    preview(val) {
        Rating.hoveredValue = val;
        Rating.renderStars(val);
    },

    renderStars(val) {
        const wrap = document.getElementById("rating-stars");
        if (!wrap) return;
        const stars = wrap.querySelectorAll(".star-btn");
        stars.forEach((btn, idx) => {
            btn.classList.toggle("active", idx < val);
        });
    },

    async submit(val) {
        const err = document.getElementById("rating-error");
        if (!Rating.currentOrderId) return;
        if (err) err.style.display = "none";
        try {
            await fbSubmitCustomerRating(Rating.currentOrderId, val);
            await App.loadRestaurants();
            Rating.close();
        } catch (e) {
            if (err) {
                err.textContent = e.message || "Could not submit rating.";
                err.style.display = "block";
            } else {
                alert(e.message || "Could not submit rating.");
            }
        }
    },

    maybePrompt() {
        if (!isCustomer() || Rating.isOpen) return;
        if (State.currentPage === "login" || State.currentPage === "apply") return;

        const delivered = (State.orders || []).filter(o => o.status === "Delivered");
        if (!delivered.length) return;

        const ratedRestaurantIds = new Set(
            delivered
                .filter(o => o.customerRatedAt || o.customerRating)
                .map(o => o.restaurantId)
                .filter(Boolean)
        );

        const candidate = delivered.find(o => {
            if (!o.restaurantId) return false;
            if (ratedRestaurantIds.has(o.restaurantId)) return false;
            if (o.customerRatedAt || o.customerRating) return false;
            try {
                if (localStorage.getItem(`tafa7ny_rating_dismissed_${o.id}`) === "1") return false;
            } catch { }

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
};

/* ════════════════════════════════════════════════════
   UI MODULE
════════════════════════════════════════════════════ */
window.UI = {
    toggleTheme() {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        UI.applyTheme(!isDark);
        document.getElementById("setting-dark").checked = !isDark;
    },
    applyThemeFromToggle(isDark) { UI.applyTheme(isDark); },
    applyTheme(isDark) {
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
        localStorage.setItem("tafa7ny-theme", isDark ? "dark" : "light");
        const icon = document.getElementById("theme-icon");
        icon.innerHTML = isDark
            ? `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>`
            : `<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>`;
    },
    initTheme() {
        const saved = localStorage.getItem("tafa7ny-theme") || "light";
        UI.applyTheme(saved === "dark");
        if (saved === "dark") document.getElementById("setting-dark").checked = true;
    },

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

    updateCartBadge() {
        const n = Cart.count;
        const btn = document.getElementById("nav-cart-btn");
        const cnt = document.getElementById("nav-cart-count");
        cnt.textContent = n;
        btn.classList.toggle("empty", n === 0);
    },

    refreshOrderBadges() {
        UI.updateCartBadge();
        const activeOrders = State.orders.filter(o => o.status !== "Delivered" && o.ownerId === State.user?.id);
        const nb = document.getElementById("nav-active-orders");
        if (State.user?.role === "owner" && activeOrders.length) { nb.textContent = `${activeOrders.length} active`; nb.style.display = "inline-block"; }
        else nb.style.display = "none";
    },

    toggleDropdown() { document.getElementById("profile-dropdown").classList.toggle("open"); },
    closeDropdown() { document.getElementById("profile-dropdown").classList.remove("open"); },

    switchLoginTab(tab) {
        Auth.currentTab = tab;
        document.getElementById("tab-login").classList.toggle("active", tab === "login");
        document.getElementById("tab-register").classList.toggle("active", tab === "register");
        document.getElementById("reg-fields").style.display = tab === "register" ? "block" : "none";
        document.getElementById("auth-submit-btn").textContent = tab === "login" ? "Sign in" : "Create account";
        UI.setAuthError("");
    },

    setAuthError(msg) {
        const el = document.getElementById("auth-error");
        el.textContent = msg; el.style.display = msg ? "block" : "none";
    },

    setBtnLoading(id, loading, text) {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? `<span class="spinner"></span> ${text}`
            : text;
    },

    previewImage(input, previewId) {
        const wrap = document.getElementById(previewId);
        const img = wrap?.querySelector("img");
        const url = input?.value?.trim();
        if (!url || !wrap || !img) { wrap?.classList.remove("show"); return; }
        img.src = url;
        img.onload = () => wrap.classList.add("show");
        img.onerror = () => wrap.classList.remove("show");
    }
};

/* ── Close dropdown on outside click ── */
document.addEventListener("click", e => {
    const wrap = document.querySelector(".profile-wrap");
    if (wrap && !wrap.contains(e.target)) UI.closeDropdown();
});

/* ── Start the app ── */
App.init();