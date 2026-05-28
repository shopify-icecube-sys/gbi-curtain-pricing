import type {
  CartTransformRunInput,
  CartTransformRunResult,
  Operation,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const operations: Operation[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const priceAttr = line.attribute;
    if (!priceAttr?.value) continue;

    const calculatedPriceStr = priceAttr.value.replace(/[^0-9.]/g, "");
    const calculatedPrice = parseFloat(calculatedPriceStr);

    if (isNaN(calculatedPrice) || calculatedPrice <= 0) continue;

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: calculatedPrice.toFixed(2),
            },
          },
        },
      },
    });
  }

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
