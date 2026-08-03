import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ShoppingCart } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/site/SiteLayout";
import { Reveal } from "@/components/site/Reveal";
import {
  slugify,
  formatPKR,
  parsePrice,
} from "@/lib/site-data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} Supplements — OxiGen Pakistan`,
      },
      {
        name: "description",
        content: `Browse ${params.slug.replace(/-/g, " ")} supplements from OxiGen. Premium quality, free shipping across Pakistan.`,
      },
    ],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { addToCart, toggleWishlist, inWishlist } = useStore();

  const categoryName = slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <SiteLayout>
      <PageHeader
        eyebrow={`${categoryName}`}
        title={`${categoryName} Supplements`}
        sub={`Explore our range of premium ${categoryName.toLowerCase()} supplements.`}
      />
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <p className="text-center text-muted-foreground">
            Products in this category are coming soon.{" "}
            <Link
              to="/shop"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Browse all products
            </Link>
          </p>
        </Reveal>
      </section>
    </SiteLayout>
  );
}
