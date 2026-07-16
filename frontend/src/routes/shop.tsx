import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Truck, ShieldCheck, RotateCcw, ShoppingCart, Heart } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/site/SiteLayout";
import { Reveal } from "@/components/site/Reveal";
import {
  brand,
  products,
  categories,
  perks,
  slugify,
  formatPKR,
  parsePrice,
} from "@/lib/site-data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop Supplements — OxiGen | Free Shipping in Pakistan" },
      {
        name: "description",
        content:
          "Buy OxiGen health supplements online — OxiGlo L-Glutathione 750mg, Nutri-Cept women's wellness and Focus. Free shipping, quality guaranteed and 7-day returns across Pakistan.",
      },
      { property: "og:title", content: "Shop Supplements — OxiGen" },
      {
        property: "og:description",
        content: "Buy premium OxiGen supplements online with free shipping across Pakistan.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/shop" },
      { property: "og:image", content: products[0].img },
      { name: "twitter:image", content: products[0].img },
    ],
    links: [{ rel: "canonical", href: "/shop" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: products.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: p.name,
              description: p.desc,
              image: p.img,
              brand: { "@type": "Brand", name: "OxiGen" },
              offers: {
                "@type": "Offer",
                priceCurrency: "PKR",
                price: p.price.replace(/[^0-9]/g, "") || undefined,
                availability:
                  p.price === "Coming Soon"
                    ? "https://schema.org/PreOrder"
                    : "https://schema.org/InStock",
                url: p.href,
              },
            },
          })),
        }),
      },
    ],
  }),
  component: Shop,
});

const perkIcons = [Truck, ShieldCheck, RotateCcw];

function Shop() {
  const { addToCart, toggleWishlist, inWishlist } = useStore();
  return (
    <SiteLayout>
      {/* Decorative right-side panel in logo colors */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 right-0 -z-10 w-24 bg-gradient-to-b from-primary via-accent to-primary opacity-15 blur-2xl sm:w-40 lg:w-56"
      />
      <PageHeader
        eyebrow="Best Sellings"
        title="Shop All Supplements"
        sub="Quality ingredients, transparent formulations, science-informed nutrition — delivered to your door."
      />

      <section className="mx-auto max-w-6xl px-5 pb-8">
        <div className="grid gap-7 md:grid-cols-3">
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
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {perks.map((p, i) => {
            const Icon = perkIcons[i];
            return (
              <Reveal key={p.title} delay={i * 0.08}>
                <div className="flex items-start gap-4 rounded-3xl glass p-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="font-display font-bold text-ink">{p.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="font-display text-2xl font-extrabold text-ink">Shop by Category</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.06}>
              <Link
                to="/categories"
                className="group block overflow-hidden rounded-3xl glass p-5 transition-all duration-500 hover:-translate-y-2"
              >
                <div className="mb-4 aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-secondary to-white">
                  <img
                    src={c.img}
                    alt={`${c.title} supplements`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
                <h3 className="font-display font-bold text-ink">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-4 text-center">
        <a
          href={brand.whatsapp}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald to-accent px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          Order on WhatsApp <ArrowUpRight className="h-4 w-4" />
        </a>
      </section>
    </SiteLayout>
  );
}
