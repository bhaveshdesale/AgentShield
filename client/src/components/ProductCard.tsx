import type { Product } from "../types";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const price = (product.priceInPaise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });
  const inStock = product.inventory > 0;

  return (
    <div className="w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex justify-between">
        <h4 className="font-medium text-neutral-900">{product.name}</h4>
        <span className="text-sm font-semibold text-neutral-900">{price}</span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{product.category}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={inStock ? "text-success-600" : "text-danger-600"}>
          {inStock ? `${product.inventory} available` : "Out of stock"}
        </span>
        {product.tags.length > 0 && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.25 text-neutral-500">{product.tags.join(", ")}</span>
        )}
      </div>
    </div>
  );
}
