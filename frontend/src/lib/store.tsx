import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { catalog, type CatalogItem } from "./site-data";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CartLine = { slug: string; qty: number };
export type User = { name: string; email: string };
export type Order = {
  id: string;
  date: string;
  items: { slug: string; name: string; qty: number; price: number }[];
  total: number;
  customer: { name: string; email: string; phone: string; address: string; city: string };
};

type StoreValue = {
  // cart
  cart: CartLine[];
  cartItems: (CatalogItem & { qty: number })[];
  cartCount: number;
  subtotal: number;
  addToCart: (slug: string, qty?: number) => void;
  removeFromCart: (slug: string) => void;
  setQty: (slug: string, qty: number) => void;
  clearCart: () => void;
  // drawer
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  // wishlist
  wishlist: string[];
  wishlistItems: CatalogItem[];
  toggleWishlist: (slug: string) => void;
  inWishlist: (slug: string) => boolean;
  // auth
  user: User | null;
  signIn: (usr: string, pwd: string) => Promise<boolean>;
  signUp: (email: string, full_name: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  // orders
  orders: Order[];
  placeOrder: (o: {
    items: { slug: string; qty: number }[];
    customer: { name: string; email: string; phone: string; address: string; city: string };
  }) => Promise<Order | null>;
};

const StoreContext = createContext<StoreValue | null>(null);

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                                */
/* ------------------------------------------------------------------ */

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // hydrate from storage after mount (avoids SSR mismatch)
  useEffect(() => {
    setCart(load<CartLine[]>("oxi_cart", []));
    setWishlist(load<string[]>("oxi_wishlist", []));
    // Check with server if session is still valid
    fetch(`${API_BASE}/auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.user) {
          setUser(res.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        // Fall back to localStorage on network error
        setUser(load<User | null>("oxi_user", null));
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) save("oxi_cart", cart);
  }, [cart, hydrated]);
  useEffect(() => {
    if (hydrated) save("oxi_wishlist", wishlist);
  }, [wishlist, hydrated]);
  useEffect(() => {
    if (hydrated) save("oxi_user", user);
  }, [user, hydrated]);

  // Load user orders from server when user updates or hydrates
  useEffect(() => {
    if (hydrated && user) {
      fetch(`${API_BASE}/orders?email=${encodeURIComponent(user.email)}`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((res) => {
          if (res.success) {
            setOrders(res.orders);
          }
        })
        .catch(console.error);
    } else if (hydrated && !user) {
      setOrders([]);
    }
  }, [user, hydrated]);

  const addToCart = (slug: string, qty = 1) => {
    const product = catalog.find((p) => p.slug === slug);
    if (!product) return;
    if (!product.available) {
      toast.info(`${product.name} is coming soon.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.slug === slug);
      if (existing) {
        return prev.map((l) => (l.slug === slug ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { slug, qty }];
    });
    toast.success(`Added to cart — ${product.name}`);
    setDrawerOpen(true);
  };

  const removeFromCart = (slug: string) => setCart((prev) => prev.filter((l) => l.slug !== slug));

  const setQty = (slug: string, qty: number) =>
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.slug !== slug)
        : prev.map((l) => (l.slug === slug ? { ...l, qty } : l)),
    );

  const clearCart = () => setCart([]);

  const toggleWishlist = (slug: string) => {
    const product = catalog.find((p) => p.slug === slug);
    setWishlist((prev) => {
      if (prev.includes(slug)) {
        toast(`Removed from wishlist`);
        return prev.filter((s) => s !== slug);
      }
      toast.success(`Saved to wishlist${product ? ` — ${product.name}` : ""}`);
      return [...prev, slug];
    });
  };

  const inWishlist = (slug: string) => wishlist.includes(slug);

  const signUp = async (email: string, full_name: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, full_name }),
      }).then((r) => r.json());

      if (!res.success) {
        toast.error(res.error || "Sign up failed.");
        return false;
      }
      toast.success("Account created! Check your email to set your password.");
      return true;
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred during sign up.");
      return false;
    }
  };

  const signIn = async (usr: string, pwd: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ usr, pwd }),
      }).then((r) => r.json());

      if (!res.success) {
        toast.error(res.error || "Sign in failed.");
        return false;
      }
      setUser(res.user ?? null);
      toast.success(`Welcome back, ${res.user?.name}!`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred during sign in.");
      return false;
    }
  };

  const signOut = async () => {
    // Always clear local state first so the UI updates immediately,
    // even if the network request fails (e.g. backend is offline).
    setUser(null);
    toast("Signed out.");
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      // Network error is non-fatal — local state is already cleared.
      console.warn("signOut: could not reach server, cleared local session only.", err);
    }
    return true;
  };

  const placeOrder = async (o: {
    items: { slug: string; qty: number }[];
    customer: { name: string; email: string; phone: string; address: string; city: string };
  }) => {
    try {
      const res = await fetch(`${API_BASE}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(o),
      }).then((r) => r.json());

      if (!res.success) {
        toast.error(res.error || "Order placement failed.");
        return null;
      }
      const order = res.order as Order;
      setOrders((prev) => [order, ...prev]);
      clearCart();
      return order;
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred while placing order.");
      return null;
    }
  };

  const value = useMemo<StoreValue>(() => {
    const cartItems = cart
      .map((l) => {
        const p = catalog.find((c) => c.slug === l.slug);
        return p ? { ...p, qty: l.qty } : null;
      })
      .filter(Boolean) as (CatalogItem & { qty: number })[];
    const cartCount = cart.reduce((s, l) => s + l.qty, 0);
    const subtotal = cartItems.reduce((s, l) => s + l.price * l.qty, 0);
    const wishlistItems = wishlist
      .map((s) => catalog.find((c) => c.slug === s))
      .filter(Boolean) as CatalogItem[];

    return {
      cart,
      cartItems,
      cartCount,
      subtotal,
      addToCart,
      removeFromCart,
      setQty,
      clearCart,
      drawerOpen,
      setDrawerOpen,
      wishlist,
      wishlistItems,
      toggleWishlist,
      inWishlist,
      user,
      signIn,
      signUp,
      signOut,
      orders,
      placeOrder,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, wishlist, user, orders, drawerOpen]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
