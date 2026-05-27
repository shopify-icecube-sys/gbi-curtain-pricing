import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);


  const query = `
    query {
      metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "custom") {
        edges {
          node {
            key
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const data = await response.json();

    const existingKeys = data.data?.metafieldDefinitions?.edges.map((e: any) => e.node.key) || [];
    const requiredKeys = ["fabric_roll_width", "vertical_pattern_repeat", "fabric_cost_per_metre"];


    const allExist = requiredKeys.every(key => existingKeys.includes(key));

    return { metafieldsExist: allExist };
  } catch (error) {
    return { metafieldsExist: false };
  }
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const CREATE_METAFIELD_DEFINITION = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const definitions = [
    {
      name: "Fabric Roll Width",
      namespace: "custom",
      key: "fabric_roll_width",
      description: "Width of the fabric roll",
      type: "number_integer",
      ownerType: "PRODUCT",
    },
    {
      name: "Vertical Pattern Repeat",
      namespace: "custom",
      key: "vertical_pattern_repeat",
      description: "Vertical pattern repeat size",
      type: "number_integer",
      ownerType: "PRODUCT",
    },
    {
      name: "Fabric Cost Per Metre",
      namespace: "custom",
      key: "fabric_cost_per_metre",
      description: "Cost of the fabric per metre",
      type: "number_decimal",
      ownerType: "PRODUCT",
    }
  ];

  let successCount = 0;
  let errors: any[] = [];

  for (const def of definitions) {
    try {
      const response = await admin.graphql(CREATE_METAFIELD_DEFINITION, {
        variables: { definition: def },
      });
      const data = await response.json();

      if (data.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
        errors.push(...data.data.metafieldDefinitionCreate.userErrors);
      } else {
        successCount++;
      }
    } catch (err) {
      console.error("Error creating metafield:", err);
    }
  }

  return { success: true, createdCount: successCount, errors };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();


  const { metafieldsExist } = useLoaderData<typeof loader>();

  const isSubmitting = fetcher.state === "submitting" || fetcher.state === "loading";


  const isSetupComplete = metafieldsExist || fetcher.data?.success;

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.success) {
        shopify.toast.show("Metafields initialized successfully!");
      } else {
        shopify.toast.show("Something went wrong", { isError: true });
      }
    }
  }, [fetcher.data, fetcher.state, shopify]);

  return (
    <s-page heading="GBI Curtain Pricing">
      <s-section heading="Welcome to GBI Curtain Pricing 🪟">
        <s-paragraph>
          GBI Curtain Pricing enables dynamic, rule-based pricing at checkout
          for curtain products. Using Shopify's Cart Transform API, this app
          automatically adjusts line item prices based on product dimensions,
          fabric type, and custom configuration.
        </s-paragraph>
      </s-section>

      <s-section heading="1. App Setup (Required)">
        <s-paragraph>
          Before using the app, you need to create the required metafields for your products.
          Click the button below to automatically create them in your store.
        </s-paragraph>

        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          <s-button
            variant={isSetupComplete ? "secondary" : "primary"}
            onClick={() => fetcher.submit({}, { method: "post" })}
            loading={isSubmitting ? true : undefined}
            disabled={isSetupComplete ? true : undefined}
          >
            {isSubmitting
              ? "Setting up..."
              : isSetupComplete
                ? "Metafields Setup Complete ✅"
                : "Initialize Required Metafields"}
          </s-button>
        </div>

        <s-paragraph>
          <s-text tone="neutral">
            This creates: <b>custom.fabric_roll_width</b> (Integer), <b>custom.vertical_pattern_repeat</b> (Integer), and <b>custom.fabric_cost_per_metre</b> (Decimal).
          </s-text>
        </s-paragraph>
      </s-section>

      <s-section heading="2. How It Works">
        <s-unordered-list>
          <s-list-item>Add values to the newly created metafields in your Product pages.</s-list-item>
          <s-list-item>Customers add curtain products to their cart as normal.</s-list-item>
          <s-list-item>The Cart Transform function automatically reads the metafields and calculates the final price at checkout.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
