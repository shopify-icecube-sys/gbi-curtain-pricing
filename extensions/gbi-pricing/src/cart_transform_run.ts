import type {
  RunInput,
  FunctionRunResult,
  CartOperation,
} from "../generated/api";

const NO_CHANGES: FunctionRunResult = {
  operations: [],
};

export function cartTransformRun(input: RunInput): FunctionRunResult {
  const operations: CartOperation[] = [];

  for (const line of input.cart.lines) {
    if (line.attribute && line.attribute.value) {
      const calculatedPriceString = line.attribute.value.replace(/[^0-9.]/g, '');
      const calculatedPrice = parseFloat(calculatedPriceString);

      if (!isNaN(calculatedPrice) && calculatedPrice > 0) {
        operations.push({
          update: {
            cartLineId: line.id,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: "99.99"
                }
              }
            }
          }
        });
      }
    } else {
      // DEBUG: Visual indicator that the function ran but found no attribute
      operations.push({
        update: {
          cartLineId: line.id,
          title: `[GBI Error] No Price Found`
        }
      });
    }
  }

  return operations.length > 0 ? { operations } : NO_CHANGES;
}