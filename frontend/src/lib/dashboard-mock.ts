// Dummy dashboard data. Replace with real API calls when wiring the backend.
import { catalog } from "./site-data";

export type MockOrderStatus =
  | "Confirmed"
  | "Processing"
  | "Packed"
  | "Shipped"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled";

export type MockOrder = {
  id: string;
  date: string;
  status: MockOrderStatus;
  paymentStatus: "Paid" | "Pending" | "COD";
  paymentMethod: string;
  courier: string;
  tracking: string;
  eta: string;
  items: { slug: string; name: string; img: string; qty: number; price: number }[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  billing: MockAddress;
  shipping_address: MockAddress;
  timeline: { label: MockOrderStatus; date: string; done: boolean }[];
};

export type MockAddress = {
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

const p = (i: number) => catalog[i % catalog.length];

const buildTimeline = (upto: MockOrderStatus): { label: MockOrderStatus; date: string; done: boolean }[] => {
  const steps: MockOrderStatus[] = ["Confirmed", "Processing", "Packed", "Shipped", "Out for Delivery", "Delivered"];
  const idx = steps.indexOf(upto);
  return steps.map((s, i) => ({
    label: s,
    date: i <= idx ? `2025-07-${10 + i} · ${9 + i}:${(i * 13) % 60 || 15} AM` : "—",
    done: i <= idx,
  }));
};

export const mockOrders: MockOrder[] = [
  {
    id: "OXI-8A2K91",
    date: "2025-07-15",
    status: "Shipped",
    paymentStatus: "Paid",
    paymentMethod: "Credit Card •••• 4242",
    courier: "TCS Express",
    tracking: "TCS-7823-9910-KL",
    eta: "18 Jul 2025",
    items: [
      { slug: p(0).slug, name: p(0).name, img: p(0).img, qty: 1, price: p(0).price || 4500 },
      { slug: p(1).slug, name: p(1).name, img: p(1).img, qty: 2, price: p(1).price || 3200 },
    ],
    subtotal: 10900,
    shipping: 0,
    discount: 500,
    total: 10400,
    billing: {
      id: "a1", label: "Home", name: "Ayesha Khan", phone: "+92 300 1234567",
      line1: "House 22, Street 4, DHA Phase 6", city: "Karachi", province: "Sindh", postal: "75500", isDefault: true,
    },
    shipping_address: {
      id: "a1", label: "Home", name: "Ayesha Khan", phone: "+92 300 1234567",
      line1: "House 22, Street 4, DHA Phase 6", city: "Karachi", province: "Sindh", postal: "75500",
    },
    timeline: buildTimeline("Shipped"),
  },
  {
    id: "OXI-4P7Q12",
    date: "2025-07-02",
    status: "Delivered",
    paymentStatus: "COD",
    paymentMethod: "Cash on Delivery",
    courier: "Leopards",
    tracking: "LEO-2231-9987",
    eta: "05 Jul 2025",
    items: [
      { slug: p(2).slug, name: p(2).name, img: p(2).img, qty: 1, price: p(2).price || 2800 },
    ],
    subtotal: 2800,
    shipping: 200,
    discount: 0,
    total: 3000,
    billing: {
      id: "a2", label: "Office", name: "Ayesha Khan", phone: "+92 300 1234567",
      line1: "Plot 88, Blue Area", city: "Islamabad", province: "ICT", postal: "44000",
    },
    shipping_address: {
      id: "a2", label: "Office", name: "Ayesha Khan", phone: "+92 300 1234567",
      line1: "Plot 88, Blue Area", city: "Islamabad", province: "ICT", postal: "44000",
    },
    timeline: buildTimeline("Delivered"),
  },
  {
    id: "OXI-3M6N77",
    date: "2025-07-10",
    status: "Processing",
    paymentStatus: "Pending",
    paymentMethod: "Bank Transfer",
    courier: "M&P",
    tracking: "MP-5522-1180",
    eta: "16 Jul 2025",
    items: [
      { slug: p(3).slug, name: p(3).name, img: p(3).img, qty: 3, price: p(3).price || 1800 },
    ],
    subtotal: 5400,
    shipping: 250,
    discount: 300,
    total: 5350,
    billing: {
      id: "a1", label: "Home", name: "Ayesha Khan", phone: "+92 300 1234567",
      line1: "House 22, Street 4, DHA Phase 6", city: "Karachi", province: "Sindh", postal: "75500",
    },
    shipping_address: {
      id: "a1", label: "Home", name: "Ayesha Khan", phone: "+92 300 1234567",
      line1: "House 22, Street 4, DHA Phase 6", city: "Karachi", province: "Sindh", postal: "75500",
    },
    timeline: buildTimeline("Processing"),
  },
];

export const mockAddresses: MockAddress[] = [
  { id: "a1", label: "Home", name: "Ayesha Khan", phone: "+92 300 1234567", line1: "House 22, Street 4, DHA Phase 6", city: "Karachi", province: "Sindh", postal: "75500", isDefault: true },
  { id: "a2", label: "Office", name: "Ayesha Khan", phone: "+92 300 1234567", line1: "Plot 88, Blue Area", city: "Islamabad", province: "ICT", postal: "44000" },
];

export const mockNotifications = [
  { id: "n1", type: "order", title: "Order OXI-8A2K91 shipped", body: "Your order is on the way with TCS Express.", time: "2h ago", read: false },
  { id: "n2", type: "promo", title: "Flash Sale: 30% OFF today", body: "Save on all OxiGlo bundles until midnight.", time: "6h ago", read: false },
  { id: "n3", type: "order", title: "Order OXI-3M6N77 confirmed", body: "We received your order and will process it soon.", time: "1d ago", read: true },
  { id: "n4", type: "account", title: "Password changed", body: "Your account password was updated successfully.", time: "3d ago", read: true },
  { id: "n5", type: "shipping", title: "Delivered — OXI-4P7Q12", body: "Thanks for shopping with OxiGen. Enjoy your wellness!", time: "1w ago", read: true },
];

export const mockDevices = [
  { id: "d1", device: "MacBook Pro · Chrome", location: "Karachi, PK", lastActive: "Active now", current: true },
  { id: "d2", device: "iPhone 15 · Safari", location: "Karachi, PK", lastActive: "2 hours ago" },
  { id: "d3", device: "Windows · Edge", location: "Lahore, PK", lastActive: "3 days ago" },
];

export const mockLoginHistory = [
  { id: "l1", when: "Today · 09:42 AM", device: "MacBook Pro · Chrome", ip: "182.180.xx.xx", status: "Success" as const },
  { id: "l2", when: "Yesterday · 08:11 PM", device: "iPhone 15 · Safari", ip: "182.180.xx.xx", status: "Success" as const },
  { id: "l3", when: "12 Jul · 11:03 PM", device: "Unknown · Firefox", ip: "39.42.xx.xx", status: "Blocked" as const },
];

export const mockTickets = [
  { id: "T-1029", subject: "Wrong item received", status: "Open" as const, updated: "2h ago" },
  { id: "T-1017", subject: "Refund status", status: "Pending" as const, updated: "1d ago" },
  { id: "T-1004", subject: "Product usage guidance", status: "Resolved" as const, updated: "1w ago" },
];

export const mockFaqs = [
  { q: "How long does delivery take?", a: "Orders are delivered within 2–4 business days across Pakistan." },
  { q: "Can I return a product?", a: "Yes, unopened products can be returned within 7 days of delivery." },
  { q: "Are products authentic?", a: "100% authentic and sealed — directly sourced from OxiGen warehouses." },
  { q: "Do you offer Cash on Delivery?", a: "Yes, COD is available on all orders across Pakistan." },
];

export const mockProfile = {
  name: "Ayesha Khan",
  email: "ayesha.khan@example.com",
  phone: "+92 300 1234567",
  gender: "Female",
  dob: "1996-04-12",
  avatar: "",
  memberSince: "March 2024",
  status: "Premium Member",
};

export function orderStats(orders: MockOrder[]) {
  return {
    total: orders.length,
    pending: orders.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled").length,
    completed: orders.filter((o) => o.status === "Delivered").length,
  };
}
