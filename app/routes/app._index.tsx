import { useEffect, useState } from "react";
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
          values: [{ name: "Standard Ivory" }, { name: "Blackout" }, { name: "Thermal Lining" }]
        },
        {
          name: "Style",
          values: [{ name: "Eyelet" }, { name: "Goblet Pleat" }, { name: "Pinch Pleat" }, { name: "Wave" }, { name: "3inch Pencil Pleat" }, { name: "6inch Pencil Pleat" }]
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
          { ownerId: productId, namespace: "custom", key: "fabric_roll_width", value: "140", type: "number_integer" },
          { ownerId: productId, namespace: "custom", key: "vertical_pattern_repeat", value: "25", type: "number_integer" },
          { ownerId: productId, namespace: "custom", key: "fabric_cost_per_metre", value: "20.0", type: "number_decimal" }
        ];
        await admin.graphql(SET_METAFIELDS_MUTATION, { variables: { metafields } });
      }

      return { success: true, productHandle: data.data?.productSet?.product?.handle, type: "product_created" };
    } catch (error: any) {
      console.error("Caught error:", error);
      return { success: false, errors: [{ message: error.message || "Unknown error" }] };
    }
  }

  if (actionType === "activate_cart_transform") {
    try {
      // 1. Get the Function ID
      const GET_FUNCTIONS = `
        query {
          shopifyFunctions(first: 10) {
            nodes {
              id
              apiType
              title
            }
          }
        }
      `;
      const funcRes = await admin.graphql(GET_FUNCTIONS);
      const funcData = await funcRes.json() as any;
      
      const cartFunction = funcData.data?.shopifyFunctions?.nodes?.find(
        (f: any) => f.apiType === "cart_transform" || f.title.includes("pricing") || f.title.includes("gbi") || f.id.includes("cart_transform")
      );

      if (!cartFunction) {
        return { success: false, errors: [{ message: "Cart Transform function not found. Did you deploy the extension?" }] };
      }

      // 2. Create the Cart Transform
      const CREATE_TRANSFORM = `
        mutation cartTransformCreate($functionId: String!) {
          cartTransformCreate(functionId: $functionId) {
            cartTransform {
              id
              functionId
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const res = await admin.graphql(CREATE_TRANSFORM, {
        variables: { functionId: cartFunction.id }
      });
      const data = await res.json() as any;
      
      if (data.data?.cartTransformCreate?.userErrors?.length > 0) {
        return { success: false, errors: data.data.cartTransformCreate.userErrors };
      }

      return { success: true, type: "cart_transform_activated" };
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
  const metafieldFetcher = useFetcher<typeof action>();
  const productFetcher = useFetcher<typeof action>();
  const transformFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const { metafieldsExist } = useLoaderData<typeof loader>();

  // Persist completed states across fetcher resets
  const [productCreated, setProductCreated] = useState(false);
  const [transformActivated, setTransformActivated] = useState(false);

  const isSetupComplete = metafieldsExist || (metafieldFetcher.data?.type === "metafields_created" && metafieldFetcher.data?.success);

  // Metafield fetcher effect
  useEffect(() => {
    if (metafieldFetcher.data && metafieldFetcher.state === "idle") {
      if (metafieldFetcher.data.success) {
        shopify.toast.show("Metafields initialized successfully!");
      } else {
        const errorMsg = metafieldFetcher.data.errors?.[0]?.message ?? "Something went wrong";
        shopify.toast.show(errorMsg, { isError: true });
      }
    }
  }, [metafieldFetcher.data, metafieldFetcher.state, shopify]);

  // Product fetcher effect
  useEffect(() => {
    if (productFetcher.data && productFetcher.state === "idle") {
      if (productFetcher.data.success) {
        setProductCreated(true);
        shopify.toast.show("Demo product created successfully!");
      } else {
        const errorMsg = productFetcher.data.errors?.[0]?.message ?? "Something went wrong";
        shopify.toast.show(errorMsg, { isError: true });
      }
    }
  }, [productFetcher.data, productFetcher.state, shopify]);

  // Transform fetcher effect
  useEffect(() => {
    if (transformFetcher.data && transformFetcher.state === "idle") {
      if (transformFetcher.data.success) {
        setTransformActivated(true);
        shopify.toast.show("Cart Transform Activated! Pricing is now live.");
      } else {
        const errorMsg = transformFetcher.data.errors?.[0]?.message ?? "Something went wrong";
        shopify.toast.show(errorMsg, { isError: true });
      }
    }
  }, [transformFetcher.data, transformFetcher.state, shopify]);

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
            onClick={() => metafieldFetcher.submit({ _action: "create_metafields" }, { method: "post" })}
            loading={metafieldFetcher.state === "submitting" ? true : undefined}
            disabled={isSetupComplete ? true : undefined}
          >
            {metafieldFetcher.state === "submitting"
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

      <s-section heading="2. Create Demo Product">
        <s-paragraph>
          To test the Cart Transform functionality, we need a product with the correct variants and metafields.
          Click the button below to generate a Demo Curtain Product on this store.
        </s-paragraph>

        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          {productCreated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <s-button variant="secondary" disabled>
                Demo Product Created ✅
              </s-button>
              <s-text tone="success">
                Product has been created! Go to Shopify Admin → Products to view and publish it.
              </s-text>
            </div>
          ) : (
            <>
              <s-button
                onClick={() => productFetcher.submit({ _action: "create_demo_product" }, { method: "post" })}
                loading={productFetcher.state === "submitting" ? true : undefined}
                disabled={!isSetupComplete ? true : undefined}
              >
                Create Demo Product
              </s-button>
              {!isSetupComplete && (
                <div style={{ marginTop: '5px' }}>
                  <s-text tone="critical">Please Initialize Metafields first (Step 1).</s-text>
                </div>
              )}
            </>
          )}
        </div>
      </s-section>

      <s-section heading="3. Activate Backend Pricing">
        <s-paragraph>
          Cart Transform (Function) extensions must be explicitly activated on the store after deployment.
          Click the button below to turn on the custom pricing backend.
        </s-paragraph>
        <div style={{ marginTop: '15px' }}>
          {transformActivated ? (
            <s-button variant="secondary" disabled>
              Pricing Backend Active ✅
            </s-button>
          ) : (
            <s-button
              onClick={() => transformFetcher.submit({ _action: "activate_cart_transform" }, { method: "post" })}
              loading={transformFetcher.state === "submitting" ? true : undefined}
            >
              Activate Pricing Backend
            </s-button>
          )}
        </div>
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
