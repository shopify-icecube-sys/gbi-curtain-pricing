import type {
  RunInput,
  FunctionRunResult,
  CartOperation,
} from "../generated/api";

const NO_CHANGES: FunctionRunResult = {
  operations: [],
};

export function cartTransformRun(input: RunInput): FunctionRunResult {
  // Get the pricing component variant ID from the shop metafield set by admin app
  const componentVariantId = input.shop?.metafield?.value;

  if (!componentVariantId) {
    // Admin has not set up the pricing component product yet
    return NO_CHANGES;
  }

  const operations: CartOperation[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    // Skip if this line IS the pricing component itself (prevent double-processing)
    if (line.merchandise.id === componentVariantId) continue;

    // Only process lines that have a calculated price
    const priceAttr = line.attribute;
    if (!priceAttr?.value) continue;

    const calculatedPriceStr = priceAttr.value.replace(/[^0-9.]/g, "");
    const calculatedPrice = parseFloat(calculatedPriceStr);

    if (isNaN(calculatedPrice) || calculatedPrice <= 0) continue;

    // Use lineExpand to split the £0 curtain into:
    //   1. Main curtain component (£0 – keeps product title/image)
    //   2. Pricing component (carries the calculated price)
    // The bundle total shown to the customer = £0 + £calculatedPrice = £calculatedPrice ✅
    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            // Main curtain – retain the product the customer chose, price £0
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: "0.00",
                },
              },
            },
          },
          {
            // Invisible pricing component – carries the full calculated price
            merchandiseId: componentVariantId,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: calculatedPrice.toFixed(2),
                },
              },
            },
          },
        ],
      },
    });
  }

  return operations.length > 0 ? { operations } : NO_CHANGES;
}