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
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create_demo_product") {
    const linings = ["Standard Ivory", "Blackout", "Thermal Lining"];
    const styles = ["Eyelet", "Goblet Pleat", "Pinch Pleat", "Wave", "3inch Pencil Pleat", "6inch Pencil Pleat"];
    
    const variants = [];
    for (const l of linings) {
      for (const s of styles) {
        variants.push({
          optionValues: [
            { optionName: "Lining", name: l },
            { optionName: "Style", name: s }
          ],
          price: "0.00"
        });
      }
    }

    const CREATE_PRODUCT_MUTATION = `
      mutation CreateDemoProduct($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productInput = {
      title: "Ashley Wilde Borneo Stone Curtain Test",
      status: "ACTIVE",
      productOptions: [
        {
          name: "Lining",
          values: [{name: "Standard Ivory"}, {name: "Blackout"}, {name: "Thermal Lining"}]
        },
        {
          name: "Style",
          values: [{name: "Eyelet"}, {name: "Goblet Pleat"}, {name: "Pinch Pleat"}, {name: "Wave"}, {name: "3inch Pencil Pleat"}, {name: "6inch Pencil Pleat"}]
        }
      ],
      variants: variants
    };

    try {
      const response = await admin.graphql(CREATE_PRODUCT_MUTATION, {
        variables: { input: productInput }
      });
      const data = await response.json() as any;
      
      if (data.data?.productSet?.userErrors?.length > 0) {
        console.error("GraphQL UserErrors:", data.data.productSet.userErrors);
        return { success: false, errors: data.data.productSet.userErrors };
      }
      
      if (data.errors) {
        console.error("GraphQL Errors:", data.errors);
        return { success: false, errors: data.errors };
      }
      
      const productId = data.data?.productSet?.product?.id;
      
      // Step 2: Set metafields on the new product
      if (productId) {
        const SET_METAFIELDS_MUTATION = `
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors {
                field
                message
              }
            }
          }
        `;
        const metafields = [
          {ownerId: productId, namespace: "custom", key: "fabric_roll_width", value: "140", type: "number_integer"},
          {ownerId: productId, namespace: "custom", key: "vertical_pattern_repeat", value: "25", type: "number_integer"},
          {ownerId: productId, namespace: "custom", key: "fabric_cost_per_metre", value: "20.0", type: "number_decimal"}
        ];
        await admin.graphql(SET_METAFIELDS_MUTATION, { variables: { metafields } });
      }
      
      return { success: true, productHandle: data.data?.productSet?.product?.handle, type: "product_created" };
    } catch (error: any) {
      console.error("Caught error:", error);
      return { success: false, errors: [{ message: error.message || "Unknown error" }] };
    }
  }


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

  return { success: true, createdCount: successCount, errors, type: "metafields_created" };
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
        if (fetcher.data.type === "product_created") {
          shopify.toast.show("Demo product created successfully!");
        } else {
          shopify.toast.show("Metafields initialized successfully!");
        }
      } else {
        const errorMsg = fetcher.data.errors && fetcher.data.errors.length > 0 
          ? fetcher.data.errors[0].message 
          : "Something went wrong";
        shopify.toast.show(errorMsg, { isError: true });
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
            onClick={() => fetcher.submit({ _action: "create_metafields" }, { method: "post" })}
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

      <s-section heading="2. App Reviewer Testing Options">
        <s-paragraph>
          To test the Cart Transform functionality, we need a product with the correct variants and metafields.
          Click the button below to generate a Demo Curtain Product on this store.
        </s-paragraph>

        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          <s-button
            onClick={() => fetcher.submit({ _action: "create_demo_product" }, { method: "post" })}
            loading={fetcher.state === "submitting" ? true : undefined}
            disabled={!isSetupComplete ? true : undefined}
          >
            Create Demo Product
          </s-button>
          {!isSetupComplete && (
            <div style={{ marginTop: '5px' }}>
              <s-text tone="critical">Please Initialize Metafields first (Step 1).</s-text>
            </div>
          )}
        </div>
      </s-section>

      <s-section heading="3. How It Works">
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
