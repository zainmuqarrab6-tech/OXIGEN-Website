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

export const mockOrders: MockOrder[] = [];

export const mockAddresses: MockAddress[] = [];

export const mockNotifications: { id: string; type: string; title: string; body: string; time: string; read: boolean }[] = [];

export const mockDevices: { id: string; device: string; location: string; lastActive: string; current?: boolean }[] = [];

export const mockLoginHistory: { id: string; when: string; device: string; ip: string; status: "Success" | "Blocked" }[] = [];

export const mockTickets: { id: string; subject: string; status: "Open" | "Pending" | "Resolved"; updated: string }[] = [];

export const mockFaqs = [
  { q: "How long does delivery take?", a: "Orders are delivered within 2–4 business days across Pakistan." },
  { q: "Can I return a product?", a: "Yes, unopened products can be returned within 7 days of delivery." },
  { q: "Are products authentic?", a: "100% authentic and sealed — directly sourced from OxiGen warehouses." },
  { q: "Do you offer Cash on Delivery?", a: "Yes, COD is available on all orders across Pakistan." },
];

export const mockProfile = {
  name: "",
  email: "",
  phone: "",
  gender: "",
  dob: "",
  avatar: "",
  memberSince: "",
  status: "",
};

export function orderStats(orders: MockOrder[]) {
  return {
    total: orders.length,
    pending: orders.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled").length,
    completed: orders.filter((o) => o.status === "Delivered").length,
  };
}
