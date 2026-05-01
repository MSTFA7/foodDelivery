/* ════════════════════════════════════════════════════
   FIREBASE CONFIG — Firebase-only mode
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

const app = FB_CONFIGURED ? initializeApp(FIREBASE_CONFIG) : null;
const auth = FB_CONFIGURED ? getAuth(app) : null;
const db = FB_CONFIGURED ? getFirestore(app) : null;

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

    if (isManager()) return fbGetRestaurants();
    if (isCustomer()) return fbGetApprovedRestaurants();

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

const Pages = {};
const App = {};
const Cart = {};
const Auth = {};
const UI = {};
const Rating = {};

Object.assign(window, {
    FIREBASE_CONFIG, FB_CONFIGURED,
    app, auth, db,
    State, ORDER_STATUSES, STATUS_CLASSES, RESTAURANT_STATUSES,
    isCustomer, isOwner, isManager, isRestaurantApproved,
    fbGetUser, fbSetUser, fbGetRestaurants, fbGetApprovedRestaurants, fbGetRestaurantsForCurrentUser,
    fbGetRestaurantByOwner, fbAddRestaurant, fbUpdateRestaurant, fbAddOrder, fbUpdateOrder,
    fbListenOrders, fbListenRestaurantsByStatus, fbSubmitCustomerRating,
    signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, serverTimestamp,
    Pages, App, Cart, Auth, UI, Rating
});

