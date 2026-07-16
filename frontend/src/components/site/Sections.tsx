import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Truck,
  ShieldCheck,
  RotateCcw,
  Star,
  Plus,
  Minus,
  Sparkles,
  BadgeCheck,
  Wallet,
  Lock,
  FlaskConical,
  Headphones,
  PackageCheck,
  ShoppingCart,
  Heart,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

import { Link } from "@tanstack/react-router";
import {
  CDN,
  brand,
  categories,
  products,
  perks,
  testimonials,
  faqs,
  slugify,
  formatPKR,
  parsePrice,
} from "@/lib/site-data";
import { useStore } from "@/lib/store";
import { Reveal } from "./Reveal";

function Heading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </span>
      <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
        {title}
      </h2>
      {sub && <p className="mt-4 text-lg text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Categories({ showHeading = true }: { showHeading?: boolean }) {
  return (
    <section
      id="categories"
      className={`relative mx-auto max-w-6xl px-5 ${showHeading ? "py-24" : "pb-24 pt-4"}`}
    >
      {showHeading && (
        <Reveal>
          <Heading
            eyebrow="Natural choice for your health"
            title="Shop by Category"
            sub="Explore premium nutritional supplements for every wellness goal."
          />
        </Reveal>
      )}
      <div className={`${showHeading ? "mt-14" : ""} grid gap-6 sm:grid-cols-2 lg:grid-cols-4`}>
        {categories.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.08}>
            <Link
              to="/shop"
              className="group relative block overflow-hidden rounded-3xl glass p-5 transition-all duration-500 hover:-translate-y-2"
            >
              <div className="relative mb-5 aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-secondary to-white">
                <img
                  src={c.img}
                  alt={`${c.title} supplements`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-white transition-transform duration-300 group-hover:rotate-45">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Products() {
  const { addToCart, toggleWishlist, inWishlist } = useStore();
  return (
    <section id="products" className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <Heading
            eyebrow="Best Sellings"
            title="Featured Wellness Supplements"
            sub="Quality ingredients, transparent formulations, science-informed nutrition."
          />
        </Reveal>
        <div className="mt-14 grid gap-7 md:grid-cols-3">
          {products.map((p, i) => {
            const slug = slugify(p.name);
            const available = p.price !== "Coming Soon";
            const saved = inWishlist(slug);
            return (
              <Reveal key={p.name} delay={i * 0.1}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl glass p-6 transition-all duration-500 hover:-translate-y-2">
                  <span className="absolute left-6 top-6 z-10 rounded-full bg-gradient-to-r from-primary to-accent px-3 py-1 text-xs font-semibold text-white shadow">
                    {p.tag}
                  </span>
                  <button
                    aria-label="Toggle wishlist"
                    onClick={() => toggleWishlist(slug)}
                    className={`absolute right-6 top-6 z-10 grid h-9 w-9 place-items-center rounded-full glass transition-colors ${saved ? "text-primary" : "text-ink hover:text-primary"}`}
                  >
                    <Heart className={`h-4 w-4 ${saved ? "fill-primary" : ""}`} />
                  </button>
                  <Link
                    to="/product/$slug"
                    params={{ slug }}
                    className="relative mb-6 aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-br from-secondary via-white to-secondary"
                  >
                    <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-gradient-to-t from-primary/10 to-transparent" />
                    <img
                      src={p.img}
                      alt={`${p.name} — ${p.subtitle}`}
                      loading="lazy"
                      className="h-full w-full object-contain p-6 transition-transform duration-700 group-hover:scale-110"
                    />
                  </Link>
                  <Link
                    to="/product/$slug"
                    params={{ slug }}
                    className="font-display text-lg font-bold text-ink hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-1 text-sm font-medium text-primary">{p.subtitle}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {p.desc}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-extrabold text-ink">
                        {available ? formatPKR(parsePrice(p.price)) : p.price}
                      </span>
                      {p.was && (
                        <span className="text-sm text-muted-foreground line-through">{p.was}</span>
                      )}
                    </div>
                    <button
                      onClick={() => addToCart(slug)}
                      disabled={!available}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-transform duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {available ? (
                        <>
                          Add <ShoppingCart className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          Soon <ArrowUpRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Mission() {
  return (
    <section id="about" className="mx-auto max-w-6xl px-5 py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] glass p-3">
            <img
              src={`${CDN}/Why_OxiGlo_L-Glutathione_Is_A_Popular_Choice_In_Pakistan.webp?v=1780668630&width=1400`}
              alt="Why OxiGlo L-Glutathione is a popular choice in Pakistan"
              loading="lazy"
              className="h-full w-full rounded-[2rem] object-cover"
            />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald">
            <Sparkles className="h-3.5 w-3.5" /> Our Mission — Wellness for Life
          </span>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Exploring the goodness of nature with innovation
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            At OxiGen we aim to explore the goodness of nature with innovation. We are dedicated to
            playing our role in building a happy & healthy community.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Quality and transparency are at the heart of everything we do. We carefully select
            ingredients and formulate products with a focus on safety, quality, and everyday
            wellness support — helping you make informed choices about your health through trusted
            nutritional solutions.
          </p>
          <Link
            to="/about"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-transform hover:scale-105"
          >
            Learn More <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const perkIcons = [Truck, ShieldCheck, RotateCcw];

export function Why() {
  return (
    <section id="why" className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-secondary/60 to-transparent" />
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <Heading eyebrow="Why Choose Us" title="A wellness experience you can trust" />
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {perks.map((p, i) => {
            const Icon = perkIcons[i];
            return (
              <Reveal key={p.title} delay={i * 0.1}>
                <div className="group h-full rounded-3xl glass p-8 transition-all duration-500 hover:-translate-y-2">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-lg transition-transform duration-500 group-hover:scale-110">
                    <Icon className="h-7 w-7" />
                  </span>
                  <h3 className="mt-6 font-display text-xl font-bold text-ink">{p.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{p.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Results() {
  return (
    <section id="results" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <Heading
          eyebrow="Real Results"
          title="Visible transformation"
          sub="See the difference consistent, quality nutrition can make."
        />
      </Reveal>
      <div className="mt-14 grid gap-6 sm:grid-cols-2">
        {[
          { img: `${CDN}/before_2.webp?v=1780588913&width=1200`, label: "Before" },
          { img: `${CDN}/after_oxigen.png?v=1780590184&width=1200`, label: "After" },
        ].map((r, i) => (
          <Reveal key={r.label} delay={i * 0.12}>
            <div className="group relative overflow-hidden rounded-[2rem] glass p-3">
              <span className="absolute left-6 top-6 z-10 rounded-full bg-ink/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
                {r.label}
              </span>
              <img
                src={r.img}
                alt={`${r.label} using OxiGen supplements`}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-[1.5rem] object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Testimonials({ showHeading = true }: { showHeading?: boolean }) {
  return (
    <section id="reviews" className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute right-0 top-1/4 -z-10 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
      <div className="mx-auto max-w-6xl px-5">
        {showHeading && (
          <Reveal>
            <Heading
              eyebrow="Let customers speak for us"
              title="Loved across Pakistan"
              sub="from 18 reviews"
            />
          </Reveal>
        )}
        <div className={`${showHeading ? "mt-14" : ""} grid gap-6 md:grid-cols-2`}>
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.1}>
              <figure className="h-full rounded-3xl glass p-8">
                <div className="flex gap-1 text-accent">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{t.title}</h3>
                <blockquote className="mt-3 leading-relaxed text-muted-foreground">
                  "{t.text}"
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-white">
                    {t.name[0]}
                  </span>
                  <span>
                    <span className="block font-semibold text-ink">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.date}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQ({ showHeading = true }: { showHeading?: boolean }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-24">
      {showHeading && (
        <Reveal>
          <Heading eyebrow="FAQ" title="Frequently Asked Questions" />
        </Reveal>
      )}
      <div className={`${showHeading ? "mt-12" : ""} space-y-3`}>
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <Reveal key={f.q} delay={i * 0.06}>
              <div className="overflow-hidden rounded-2xl glass">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-display font-semibold text-ink">{f.q}</span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-white">
                    {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-5 leading-relaxed text-muted-foreground">{f.a}</p>
                </motion.div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function Contact() {
  return (
    <section id="contact" className="mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.5rem] glass p-8 sm:p-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                Start your wellness journey
              </h2>
              <p className="mt-4 max-w-md text-lg text-muted-foreground">
                Have a question about our supplements? Chat with us on WhatsApp — our team is here
                to help you choose the right products.
              </p>
              <a
                href={brand.whatsapp}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald to-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
              >
                Message us on WhatsApp <ArrowUpRight className="h-4 w-4" />
              </a>
              <div className="mt-8 space-y-2 text-sm">
                <a
                  href={`mailto:${brand.email}`}
                  className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                >
                  <Mail className="h-4 w-4 text-primary" /> {brand.email}
                </a>
                <a
                  href={brand.phoneHref}
                  className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                >
                  <Phone className="h-4 w-4 text-primary" /> {brand.phone}
                </a>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" /> Nationwide delivery across{" "}
                  {brand.location}
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="rounded-full glass px-4 py-2">Free Shipping</span>
                <span className="rounded-full glass px-4 py-2">7-Day Return</span>
                <span className="rounded-full glass px-4 py-2">Cash on Delivery</span>
              </div>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = brand.whatsapp;
              }}
            >
              {[
                { label: "Your Name", type: "text", ph: "Enter your name" },
                { label: "Phone", type: "tel", ph: "03xx xxxxxxx" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-sm font-medium text-ink">{f.label}</label>
                  <input
                    type={f.type}
                    required
                    placeholder={f.ph}
                    className="w-full rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm text-ink shadow-inner outline-none backdrop-blur transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Message</label>
                <textarea
                  rows={4}
                  placeholder="How can we help?"
                  className="w-full resize-none rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm text-ink shadow-inner outline-none backdrop-blur transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02]"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Sections() {
  return (
    <>
      <Categories />
      <Products />
      <Mission />
      <Why />
      <Results />
      <Testimonials />
      <FAQ />
      <Contact />
    </>
  );
}

const trustItems = [
  { icon: BadgeCheck, title: "100% Authentic", desc: "Genuine, sealed products" },
  { icon: Wallet, title: "Cash on Delivery", desc: "Pay when it arrives" },
  { icon: Lock, title: "Secure Checkout", desc: "Safe & encrypted" },
  { icon: FlaskConical, title: "Lab-Tested", desc: "Quality verified" },
  { icon: Truck, title: "Free Shipping", desc: "Across Pakistan" },
  { icon: Headphones, title: "24/7 Support", desc: "Always here to help" },
];

export function TrustBadges() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-14">
      <Reveal>
        <Heading
          eyebrow="Shop with confidence"
          title="Why thousands trust OxiGen"
          sub="A safe, professional and reliable shopping experience — every single order."
        />
      </Reveal>
      <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {trustItems.map((t, i) => (
          <Reveal key={t.title} delay={i * 0.06}>
            <div className="flex h-full flex-col items-center gap-2.5 rounded-3xl glass p-5 text-center transition-transform duration-300 hover:-translate-y-1.5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white">
                <t.icon className="h-6 w-6" />
              </span>
              <h3 className="font-display text-sm font-bold text-ink">{t.title}</h3>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
