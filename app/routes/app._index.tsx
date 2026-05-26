import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="GBI Curtain Pricing">
      {/* === Main Content === */}
      <s-section heading="Welcome to GBI Curtain Pricing 🪟">
        <s-paragraph>
          GBI Curtain Pricing enables dynamic, rule-based pricing at checkout
          for curtain products. Using Shopify's Cart Transform API, this app
          automatically adjusts line item prices based on product dimensions,
          fabric type, and custom configuration — giving your customers accurate
          pricing before they complete their purchase.
        </s-paragraph>
      </s-section>

      <s-section heading="How It Works">
        <s-paragraph>
          Once installed, the app registers a Cart Transform function that runs
          automatically during checkout. No manual configuration is needed for
          basic operation.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            Customers add curtain products to their cart as normal.
          </s-list-item>
          <s-list-item>
            The Cart Transform function reads product metafields for pricing
            rules (width, height, fabric surcharge, etc.).
          </s-list-item>
          <s-list-item>
            Prices are adjusted automatically at checkout — no redirect or
            custom checkout required.
          </s-list-item>
          <s-list-item>
            Merchants see the final adjusted price on every order.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Getting Started">
        <s-paragraph>
          Follow these steps to activate curtain pricing on your store:
        </s-paragraph>
        <s-ordered-list>
          <s-list-item>
            Ensure your curtain products have the required metafields set
            (base_price, width_rate, height_rate, fabric_type).
          </s-list-item>
          <s-list-item>
            The Cart Transform extension activates automatically on
            installation — no additional setup needed.
          </s-list-item>
          <s-list-item>
            Test by adding a curtain product to your cart and proceeding to
            checkout to verify the adjusted price.
          </s-list-item>
          <s-list-item>
            Contact support if pricing rules need customization for your
            specific product catalog.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      {/* === Aside === */}
      <s-section slot="aside" heading="App Details">
        <s-paragraph>
          <s-text>Version: </s-text>
          <s-text>1.0.0</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Pricing Model: </s-text>
          <s-text>Free</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Technology: </s-text>
          <s-text>Shopify Cart Transform API</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Requirements: </s-text>
          <s-text>Shopify Plus</s-text>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Support">
        <s-unordered-list>
          <s-list-item>
            <s-link href="mailto:divyarajsinh@icecubedigital.com">
              Contact Support
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/build/checkout/cart-transform"
              target="_blank"
            >
              Cart Transform Docs
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
