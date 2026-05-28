import type {
  CartTransformRunInput,
  CartTransformRunResult,
  Operation,
} from "../generated/api";

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

export function cartTransformRun(
  input: CartTransformRunInput
): CartTransformRunResult {

  const componentVariantId = input.shop?.metafield?.value;

  if (!componentVariantId) {
    return NO_CHANGES;
  }

  const operations: Operation[] = [];

  for (const line of input.cart.lines) {

    if (line.merchandise.__typename !== "ProductVariant") {
      continue;
    }

    // Skip addon product itself
    if (line.merchandise.id === componentVariantId) {
      continue;
    }

    // Read property
    const calculatedPriceAttr = line.attributes?.find(
      (a) => a.key === "_calculated_price"
    );

    if (!calculatedPriceAttr?.value) {
      continue;
    }

    const calculatedPrice = parseFloat(calculatedPriceAttr.value);

    if (isNaN(calculatedPrice) || calculatedPrice <= 0) {
      continue;
    }

    operations.push({
      lineExpand: {
        cartLineId: line.id,

        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
          },

          {
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

  return operations.length > 0
    ? { operations }
    : NO_CHANGES;
}