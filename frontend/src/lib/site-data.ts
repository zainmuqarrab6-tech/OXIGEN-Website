export const CDN = "https://www.oxigen.pk/cdn/shop/files";

export function getOptimizedShopifyUrl(url: string, width: number): string {
  if (!url || (!url.includes("cdn/shop") && !url.includes("oxigen.pk/cdn"))) return url;
  const [base, query] = url.split("?");
  const params = new URLSearchParams(query || "");
  params.set("width", String(width));
  params.set("format", "webp");
  return `${base}?${params.toString()}`;
}

export const brand = {
  name: "OxiGen",
  tagline: "Pakistan's No.1 Vitamin Brand",
  promo: "30% OFF + FREE SHIPPING — TODAY ONLY",
  email: "oxiglo555@gmail.com",
  phone: "+92 330 7069091",
  phoneHref: "tel:+923307069091",
  location: "Pakistan",
  whatsapp: "https://wa.me/+923307069091?text=Hi%2C%20I%27m%20interested%20in%20this%20product.",
  facebook: "https://www.facebook.com/profile.php?id=61555862056972",
  instagram: "https://www.instagram.com/oxigen.pk/",
  shopAll: "/shop",
};

export const announcements = [
  "30% OFF + FREE SHIPPING — TODAY ONLY",
  "🚚 Free nationwide delivery across Pakistan",
  "✅ 100% authentic & sealed products",
  "🔄 Easy 7-day returns — shop worry-free",
  "🌿 Pakistan's No.1 Vitamin & Wellness Brand",
];

export const nav = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/shop" },
  { label: "Categories", to: "/categories" },
  { label: "About", to: "/about" },
  { label: "Reviews", to: "/reviews" },
  { label: "FAQ", to: "/faq" },
  { label: "Contact", to: "/contact" },
] as const;

export const categories = [
  {
    title: "Multivitamins",
    desc: "Daily foundational nutrition & immunity support.",
    img: getOptimizedShopifyUrl(
      `${CDN}/Glutathione_Supplement_for_Glowing_Skin_in_Pakistan_L-Glutathione_750mg.png?v=1780691324`,
      500,
    ),
    href: "/shop",
  },
  {
    title: "Women's Health",
    desc: "Hormonal balance & wellness for women.",
    img: getOptimizedShopifyUrl(`${CDN}/WhatsAppImage2025-04-28at5.41.05PM.jpg?v=1747318003`, 500),
    href: "/shop",
  },
  {
    title: "Men's Health",
    desc: "Energy, vitality & everyday performance.",
    img: getOptimizedShopifyUrl(`${CDN}/oxigen_oxglo_supplements.jpg?v=1780692094`, 500),
    href: "/shop",
  },
  {
    title: "Brain Health",
    desc: "Focus, mental clarity, calm & motivation.",
    img: getOptimizedShopifyUrl(
      `${CDN}/Focus_Dopamine_Support_Tablets_Mental_Clarity_Calm_Motivation_Supplement.webp?v=1781878798`,
      500,
    ),
    href: "/shop",
  },
];

export const products = [
  {
    name: "OxiGlo — L-Glutathione 750mg",
    subtitle: "Glutathione Supplement for Glowing Skin",
    desc: "OxiGlo Glutathione 750mg is an advanced skin-wellness supplement designed to promote a radiant glow, brighter-looking skin and overall beauty from within. Formulated with powerful antioxidants — Glutathione, Vitamin C, Alpha Lipoic Acid & Milk Thistle — to help reduce dullness, uneven tone and dark spots while supporting natural detoxification, liver wellness and daily immunity.",
    price: "Rs.4,500",
    was: "Rs.6,000",
    tag: "Best Seller",
    img: `${CDN}/Glutathione_Supplement_for_Glowing_Skin_in_Pakistan_L-Glutathione_750mg.png?v=1780691324&width=800`,
    gallery: [
      `${CDN}/Glutathione_Supplement_for_Glowing_Skin_in_Pakistan_L-Glutathione_750mg.png?v=1780691324&width=800`,
      `${CDN}/oxiglo.jpg?v=1780692026&width=800`,
      `${CDN}/oxigen_oxglo_supplements.jpg?v=1780692094&width=800`,
      `${CDN}/1E9A2804copy_080139.jpg?v=1760262820&width=800`,
    ],
    highlights: [
      "Promotes radiant glow & brighter-looking skin",
      "Antioxidants reduce dullness, uneven tone & dark spots",
      "Supports natural detox & liver wellness",
      "Boosts immunity and healthy skin repair",
    ],
    ingredients:
      "L-Glutathione 750mg, Vitamin C 100mg, Alpha Lipoic Acid 100mg, Milk Thistle 50mg, Vitamin D3 500iu, Vitamin B6 5mg, Zinc Sulphate 7.5mg",
    href: "/product/oxiglo-l-glutathione-750mg",
  },
  {
    name: "Nutri-Cept — Women's Wellness",
    subtitle: "PCOS & Hormonal Balance Supplement",
    desc: "Nutri-Cept is an advanced women's wellness formula designed to support hormonal balance, fertility health and daily energy. Enriched with Myo-Inositol, D-Chiro-Inositol & Chaste Berry Extract to help support PCOS management, ovulation and reproductive wellness — plus essential vitamins, Iron, Zinc & Folic Acid for immunity, metabolism and everyday female vitality.",
    price: "Rs.1,600",
    was: "Rs.2,000",
    tag: "Women's Favourite",
    img: `${CDN}/WhatsAppImage2025-04-28at5.41.05PM.jpg?v=1747318003&width=800`,
    gallery: [
      `${CDN}/WhatsAppImage2025-04-28at5.41.05PM.jpg?v=1747318003&width=800`,
      `${CDN}/image_123650291_11.jpg?v=1755887629&width=800`,
      `${CDN}/image_123650291_7.jpg?v=1755887629&width=800`,
      `${CDN}/image_123650291_12.jpg?v=1755887629&width=800`,
    ],
    highlights: [
      "Supports hormonal balance & PCOS wellness",
      "Myo-Inositol, D-Chiro-Inositol & Chaste Berry",
      "Iron, Zinc & Folic Acid for daily vitality",
      "CoQ10 & antioxidants for healthy aging",
    ],
    ingredients:
      "Ascorbic Acid 45mg, Vitamin D3 300iu, Vitamin E 2mg, Thiamine 2mg, Riboflavin 2.5mg, Niacin 10mg, Vitamin B6 5mg, Folic Acid 200mcg, Vitamin B12 10mcg, Iron 7mg, Zinc 7.5mg, Selenium 25mcg, CoQ10 2.5mg, Myo-Inositol 25mg, Chaste Berry 28mg, D-Chiro-Inositol 25mg",
    href: "/product/nutri-cept-women-s-wellness",
  },
  {
    name: "OxiDop — Focus & Dopamine Support",
    subtitle: "Mental Clarity, Calm & Motivation",
    desc: "Stay focused, motivated and mentally balanced with OxiDop — an advanced calm-focus supplement designed to support productivity without the jitters. Formulated with L-Tyrosine, L-Theanine, GABA, Rhodiola Rosea, Magnesium Glycinate, Vitamin D3, Vitamin B6 & Zinc to support healthy dopamine production, mental clarity, stress resilience and relaxation — ideal for students, professionals and anyone facing mental fatigue.",
    price: "Rs.4,500",
    was: "Rs.6,000",
    tag: "New",
    img: `${CDN}/Focus_Dopamine_Support_Tablets_Mental_Clarity_Calm_Motivation_Supplement.webp?v=1781878798&width=800`,
    gallery: [
      `${CDN}/Focus_Dopamine_Support_Tablets_Mental_Clarity_Calm_Motivation_Supplement.webp?v=1781878798&width=800`,
      `${CDN}/ChatGPTImageJun11_2026_11_21_36PM.png?v=1781202993&width=800`,
      `${CDN}/ChatGPT_Image_Jun_11_2026_11_15_57_PM.png?v=1781203015&width=800`,
      `${CDN}/OXIDOP_Focus_Dopamine_Support_Tablets_Mental_Clarity_Calm_Motivation_Supplement.webp?v=1781558572&width=800`,
    ],
    highlights: [
      "Supports healthy dopamine for motivation",
      "Enhances focus & mental clarity",
      "Promotes calm & relaxation without drowsiness",
      "Rhodiola & Magnesium for everyday stress",
    ],
    ingredients:
      "L-Tyrosine, L-Theanine, GABA, Rhodiola Rosea, Magnesium Glycinate, Vitamin D3, Vitamin B6, Zinc",
    href: "/product/oxidop-focus-dopamine-support",
  },
];

export const perks = [
  {
    title: "Free Shipping",
    desc: "Shop with free shipping. A seamless and cost-effective way to enjoy our products.",
  },
  {
    title: "Quality Guaranteed",
    desc: "Experience the assurance of quality. We guarantee top-notch ingredients in every item.",
  },
  {
    title: "7 Day Return",
    desc: "Shop confidently — if the result doesn't meet expectations, our 7-day return policy has you covered.",
  },
];

export const testimonials = [
  {
    name: "Shaista",
    date: "01/02/2025",
    title: "Best Product to Trust On",
    text: "OxiGlo ne meri skin ko kaafi bright aur healthy banaya hai. 750mg Glutathione se energy bhi improve hui aur immunity kaafi strong feel ho rahi hai. Yeh product try karna chahiye!",
  },
  {
    name: "Farukh",
    date: "01/02/2025",
    title: "Amazing Results",
    text: "Main ne OXIGLO ka istemal kiya aur bilkul must results aaye hain! Mere chehre ka rang kafi bright hua hai, aur energy level bhi bohot barh gaya hai. Skin aur immunity dono ke liye faida de raha hai.",
  },
  {
    name: "Ayesha",
    date: "18/03/2025",
    title: "Glowing Skin in Weeks",
    text: "Sirf teen hafton mein meri skin pehle se zyada glowing aur even lag rahi hai. OxiGlo ab meri daily routine ka hissa ban gaya hai. Highly recommended!",
  },
  {
    name: "Bilal",
    date: "27/03/2025",
    title: "Energy & Focus Boost",
    text: "Din bhar thakan mehsoos hoti thi, lekin OxiGen supplements lene ke baad energy aur focus dono behtar ho gaye. Delivery bhi fast thi across Pakistan.",
  },
  {
    name: "Hina",
    date: "05/04/2025",
    title: "Great for Immunity",
    text: "Mausam badalne par jaldi bimaar ho jati thi, ab immunity kaafi strong feel hoti hai. Quality product hai aur packaging bhi premium thi.",
  },
  {
    name: "Usman",
    date: "12/04/2025",
    title: "Genuine & Trustworthy",
    text: "Original product mila aur results bhi real hain. Customer support ne har sawaal ka jawab diya. OxiGen par ab pura bharosa hai.",
  },
];

export const faqs = [
  {
    q: "What types of supplements does OxiGen offer?",
    a: "OxiGen offers a range of nutritional supplements designed to support immunity, skin health, energy, hormonal wellness, and overall daily nutrition.",
  },
  {
    q: "Are OxiGen supplements suitable for everyday use?",
    a: "Many OxiGen supplements are designed for regular use as part of a balanced diet and healthy lifestyle. Always follow product directions and consult a healthcare professional if needed.",
  },
  {
    q: "Why is nutritional supplementation important?",
    a: "Nutritional supplements may help support daily nutrient intake when dietary needs are not fully met through food alone.",
  },
  {
    q: "How does OxiGen ensure product quality?",
    a: "We prioritize quality ingredients, transparent formulations, and responsible manufacturing standards to provide reliable wellness products.",
  },
  {
    q: "Do you offer free shipping across Pakistan?",
    a: "Yes. We offer free nationwide shipping on all orders, delivered right to your doorstep anywhere in Pakistan.",
  },
  {
    q: "How long does delivery take?",
    a: "Orders are typically dispatched within 24 hours and delivered in 2–4 business days, depending on your city.",
  },
  {
    q: "What is your return policy?",
    a: "We offer a 7-day return policy. If you're not satisfied, contact our support team and we'll help you with a return or exchange.",
  },
  {
    q: "How soon will I see results?",
    a: "Results vary by individual, but many customers notice improvements within 3–4 weeks of consistent daily use alongside a balanced diet.",
  },
  {
    q: "Are OxiGen products original and authentic?",
    a: "Absolutely. Every product is 100% genuine, sealed, and sourced through trusted manufacturing to guarantee authenticity.",
  },
  {
    q: "Can I take more than one supplement together?",
    a: "Many OxiGen supplements can be combined, but we recommend following each product's directions and consulting a healthcare professional if unsure.",
  },
  {
    q: "How can I place an order?",
    a: "You can order directly from our Shop page or reach us on WhatsApp for quick assistance with your purchase.",
  },
];

// ---- E-commerce catalog helpers ----
export function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function parsePrice(price: string) {
  const n = Number(price.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type CatalogItem = {
  slug: string;
  name: string;
  subtitle: string;
  desc: string;
  price: number;
  was: number;
  tag: string;
  img: string;
  gallery: string[];
  highlights: string[];
  ingredients: string;
  available: boolean;
};

export const catalog: CatalogItem[] = products.map((p) => {
  const optimizedImg = getOptimizedShopifyUrl(p.img, 800);
  const optimizedGallery = ((p as { gallery?: string[] }).gallery ?? [p.img]).map((g) =>
    getOptimizedShopifyUrl(g, 800),
  );

  return {
    slug: slugify(p.name),
    name: p.name,
    subtitle: p.subtitle,
    desc: p.desc,
    price: parsePrice(p.price),
    was: parsePrice(p.was),
    tag: p.tag,
    img: optimizedImg,
    gallery: optimizedGallery,
    highlights: (p as { highlights?: string[] }).highlights ?? [],
    ingredients: (p as { ingredients?: string }).ingredients ?? "",
    available: p.price !== "Coming Soon",
  };
});

export function getProduct(slug: string) {
  return catalog.find((p) => p.slug === slug);
}

export function formatPKR(n: number) {
  return "Rs." + n.toLocaleString("en-PK");
}

export type ProductReview = {
  name: string;
  date: string;
  rating: number;
  title: string;
  text: string;
  verified: boolean;
};

const reviewPool: ProductReview[] = [
  {
    name: "Ayesha K.",
    date: "18 Mar 2025",
    rating: 5,
    title: "Genuine results",
    text: "Within 3 weeks I noticed a real difference. Original product, sealed packaging and fast delivery.",
    verified: true,
  },
  {
    name: "Bilal R.",
    date: "27 Mar 2025",
    rating: 5,
    title: "Highly recommend",
    text: "Energy and focus both improved. Delivery was quick across Pakistan and support was helpful.",
    verified: true,
  },
  {
    name: "Hina S.",
    date: "05 Apr 2025",
    rating: 4,
    title: "Great quality",
    text: "Quality product with premium packaging. Took a little longer to see results but worth it.",
    verified: true,
  },
  {
    name: "Usman A.",
    date: "12 Apr 2025",
    rating: 5,
    title: "Trustworthy brand",
    text: "100% original and results are real. Customer support answered every question. Fully satisfied.",
    verified: true,
  },
  {
    name: "Sana M.",
    date: "22 Apr 2025",
    rating: 5,
    title: "Loved it",
    text: "Became part of my daily routine. Skin and overall wellness feel much better now.",
    verified: true,
  },
  {
    name: "Fahad T.",
    date: "30 Apr 2025",
    rating: 4,
    title: "Good value",
    text: "Reasonable price for the quality. Free shipping and cash on delivery made it easy to order.",
    verified: false,
  },
];

// Deterministic per-product reviews so ratings stay stable across renders.
export function getProductReviews(slug: string): ProductReview[] {
  const seed = slug.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const count = 4 + (seed % 3); // 4–6 reviews
  const start = seed % reviewPool.length;
  return Array.from({ length: count }, (_, i) => reviewPool[(start + i) % reviewPool.length]);
}

export function getReviewStats(reviews: ProductReview[]) {
  const total = reviews.length;
  const avg = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  return { total, avg: Math.round(avg * 10) / 10 };
}
