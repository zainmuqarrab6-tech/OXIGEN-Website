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
  status: string;
  total: number;
  items?: { slug: string; name: string; qty: number; price: number }[];
  customer?: { name: string; email: string; phone: string; address: string; city: string };
};

export type UserProfile = {
  name: string;
  email: string;
  phone: string;
  gender: string;
  dob: string;
  status: string;
  memberSince: string;
};

export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postal: string;
  isDefault?: boolean;
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
  // profile
  profile: UserProfile | null;
  fetchProfile: (email: string) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<boolean>;
  // addresses
  addresses: Address[];
  fetchAddresses: (email: string) => Promise<void>;
  addAddress: (addr: Omit<Address, "id">) => Promise<boolean>;
  updateAddress: (id: string, addr: Partial<Address>) => Promise<boolean>;
  deleteAddress: (id: string) => Promise<boolean>;
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

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const fetchOrders = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/user/orders?email=${encodeURIComponent(email)}`, {
        credentials: "include",
      }).then((r) => r.json());
      if (res.data) {
        const normalized = res.data.map((o: any) => ({
          id: o.name,
          date: o.transaction_date,
          status: o.status,
          total: o.grand_total,
        }));
        setOrders(normalized);
      }
    } catch (e) {
      console.error("fetchOrders error:", e);
    }
  };

  const fetchAddresses = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/user/addresses?email=${encodeURIComponent(email)}`, {
        credentials: "include",
      }).then((r) => r.json());
      if (res.data) {
        const normalized = res.data.map((a: any) => ({
          id: a.name,
          label: a.address_title || "Address",
          name: a.address_title || "Home",
          phone: a.phone || "",
          line1: a.address_line1 + (a.address_line2 ? `, ${a.address_line2}` : ""),
          city: a.city || "",
          province: a.state || "",
          postal: a.pincode || "",
          isDefault: a.is_primary_address === 1 || a.is_shipping_address === 1,
        }));
        setAddresses(normalized);
      }
    } catch (e) {
      console.error("fetchAddresses error:", e);
    }
  };

  const fetchProfile = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/user/profile?email=${encodeURIComponent(email)}`, {
        credentials: "include",
      }).then((r) => r.json());
      if (res.data) {
        const p = res.data;
        setProfile({
          name: p.full_name || p.username || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "User",
          email: p.email || email,
          phone: p.mobile_no || p.phone || "",
          gender: p.gender || "Female",
          dob: p.birth_date || p.dob || "1996-04-12",
          status: "Premium Member",
          memberSince: "March 2024",
        });
      }
    } catch (e) {
      console.error("fetchProfile error:", e);
    }
  };

  useEffect(() => {
    if (hydrated && user) {
      fetchOrders(user.email);
      fetchAddresses(user.email);
      fetchProfile(user.email);
    } else if (hydrated && !user) {
      setOrders([]);
      setAddresses([]);
      setProfile(null);
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

  const updateProfile = async (patch: Partial<UserProfile>) => {
    try {
      if (!user) return false;
      const csrfRes = await fetch(`${API_BASE}/csrf-token`, { credentials: "include" }).then(r => r.json());
      const csrfToken = csrfRes.csrfToken;

      const nameParts = (patch.name || "").split(" ");
      const first_name = nameParts[0] || "";
      const last_name = nameParts.slice(1).join(" ") || "";

      const payload: Record<string, any> = {
        email: user.email,
      };
      if (patch.name !== undefined) {
        payload.full_name = patch.name;
        payload.first_name = first_name;
        payload.last_name = last_name;
      }
      if (patch.phone !== undefined) {
        payload.phone = patch.phone;
        payload.mobile_no = patch.phone;
      }
      if (patch.gender !== undefined) {
        payload.gender = patch.gender;
      }
      if (patch.dob !== undefined) {
        payload.birth_date = patch.dob;
      }

      const res = await fetch(`${API_BASE}/user/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.data) {
        fetchProfile(user.email);
        return true;
      } else {
        toast.error(res.error || "Failed to update profile.");
        return false;
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to update profile.");
      return false;
    }
  };

  const addAddress = async (addr: Omit<Address, "id">) => {
    try {
      const csrfRes = await fetch(`${API_BASE}/csrf-token`, { credentials: "include" }).then(r => r.json());
      const csrfToken = csrfRes.csrfToken;

      const res = await fetch(`${API_BASE}/user/addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          address_title: addr.label,
          address_type: "Shipping",
          address_line1: addr.line1,
          city: addr.city,
          state: addr.province,
          country: "Pakistan",
          pincode: addr.postal,
          phone: addr.phone,
        }),
      }).then((r) => r.json());

      if (res.data) {
        if (user) fetchAddresses(user.email);
        return true;
      } else {
        toast.error(res.error || "Failed to add address.");
        return false;
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to add address.");
      return false;
    }
  };

  const updateAddress = async (id: string, addr: Partial<Address>) => {
    try {
      const csrfRes = await fetch(`${API_BASE}/csrf-token`, { credentials: "include" }).then(r => r.json());
      const csrfToken = csrfRes.csrfToken;

      const payload: Record<string, any> = {};
      if (addr.label) payload.address_title = addr.label;
      if (addr.line1) payload.address_line1 = addr.line1;
      if (addr.city) payload.city = addr.city;
      if (addr.province) payload.state = addr.province;
      if (addr.postal) payload.pincode = addr.postal;
      if (addr.phone) payload.phone = addr.phone;
      if (addr.isDefault !== undefined) {
        payload.is_primary_address = addr.isDefault ? 1 : 0;
        payload.is_shipping_address = addr.isDefault ? 1 : 0;
      }

      const res = await fetch(`${API_BASE}/user/addresses/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.data) {
        if (user) fetchAddresses(user.email);
        return true;
      } else {
        toast.error(res.error || "Failed to update address.");
        return false;
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to update address.");
      return false;
    }
  };

  const deleteAddress = async (id: string) => {
    try {
      const csrfRes = await fetch(`${API_BASE}/csrf-token`, { credentials: "include" }).then(r => r.json());
      const csrfToken = csrfRes.csrfToken;

      const res = await fetch(`${API_BASE}/user/addresses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
      }).then((r) => r.json());

      if (res.message) {
        if (user) fetchAddresses(user.email);
        return true;
      } else {
        toast.error(res.error || "Failed to delete address.");
        return false;
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete address.");
      return false;
    }
  };

  const placeOrder = async (o: {
    items: { slug: string; qty: number }[];
    customer: { name: string; email: string; phone: string; address: string; city: string };
  }) => {
    try {
      const csrfRes = await fetch(`${API_BASE}/csrf-token`, { credentials: "include" }).then(r => r.json());
      const csrfToken = csrfRes.csrfToken;

      const bodyPayload = {
        items: o.items.map((i) => ({ item_code: i.slug, qty: i.qty })),
        shippingAddress: {
          address_line1: o.customer.address,
          city: o.customer.city,
          country: "Pakistan",
          phone: o.customer.phone,
        },
      };

      const res = await fetch(`${API_BASE}/user/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(bodyPayload),
      }).then((r) => r.json());

      if (!res.queued) {
        toast.error(res.error || "Order placement failed.");
        return null;
      }

      const jobId = res.jobId;
      toast.info("Order added to queue. Processing...");

      // Poll queue status
      const poll = async (): Promise<string | null> => {
        return new Promise((resolvePoll) => {
          const interval = setInterval(async () => {
            try {
              const jobRes = await fetch(`${API_BASE}/user/orders/job/${jobId}`, { credentials: "include" }).then(r => r.json());
              const job = jobRes.data;
              if (job) {
                if (job.status === "completed") {
                  clearInterval(interval);
                  resolvePoll(job.orderName || "Completed");
                } else if (job.status === "failed" || job.status === "dead") {
                  clearInterval(interval);
                  resolvePoll(null);
                }
              }
            } catch {
              // Ignore network errors
            }
          }, 1500);
        });
      };

      const orderName = await poll();
      if (!orderName) {
        toast.error("Failed to process order in queue.");
        return null;
      }

      const orderItems = o.items.map((it) => {
        const product = catalog.find((c) => c.slug === it.slug);
        return {
          slug: it.slug,
          name: product?.name || it.slug,
          qty: it.qty,
          price: product?.price || 0,
        };
      });

      const totalAmount = orderItems.reduce((s, it) => s + it.price * it.qty, 0);

      const placedOrder: Order = {
        id: orderName,
        date: new Date().toISOString().split("T")[0],
        status: "To Deliver",
        total: totalAmount,
        customer: o.customer,
        items: orderItems,
      };

      setOrders((prev) => [placedOrder, ...prev]);
      clearCart();
      return placedOrder;
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
      profile,
      fetchProfile,
      updateProfile,
      addresses,
      fetchAddresses,
      addAddress,
      updateAddress,
      deleteAddress,
      orders,
      placeOrder,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, wishlist, user, orders, drawerOpen, profile, addresses]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
