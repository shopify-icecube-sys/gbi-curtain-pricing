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
          node { key }
        }
      }
      shopMetafieldDefs: metafieldDefinitions(first: 10, ownerType: SHOP, namespace: "gbi_curtain_pricing") {
        edges {
          node { key }
        }
      }
      cartTransforms(first: 5) {
        nodes {
          id
          functionId
        }
      }
      products(first: 5, query: "title:'Ashley Wilde Borneo Stone Curtain Test'") {
        nodes {
          id
          title
        }
      }
      shop {
        myshopifyDomain
        metafield(namespace: "gbi_curtain_pricing", key: "component_variant_id") {
          value
        }
      }
      themes: themes(first: 5, roles: [MAIN]) {
        nodes {
          id
          name
          role
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

    const cartTransformActive = (data.data?.cartTransforms?.nodes?.length ?? 0) > 0;
    const demoProductExists = (data.data?.products?.nodes?.length ?? 0) > 0;

    const componentVariantId = data.data?.shop?.metafield?.value || null;

    // Check if shop metafield DEFINITION exists (required for Shopify Functions to read it)
    const shopMetaDefKeys = data.data?.shopMetafieldDefs?.edges.map((e: any) => e.node.key) || [];
    const componentMetaDefExists = shopMetaDefKeys.includes("component_variant_id");

    // Component is truly ready only when BOTH the value exists AND the definition exists
    const pricingComponentExists = !!componentVariantId && componentMetaDefExists;

    // Build theme editor deep link
    const shopDomain = data.data?.shop?.myshopifyDomain || "";
    const mainTheme = data.data?.themes?.nodes?.[0];
    // Extract numeric theme ID from GID (e.g. "gid://shopify/Theme/123" → "123")
    const themeId = mainTheme?.id?.split("/").pop() || "current";
    // Deep-link URL: opens theme editor at product template, prompts to add the app block
    const EXTENSION_UUID = "2b7b26b4-898e-b926-7989-1fabeee0b0025804e602";
    const themeEditorUrl = `https://${shopDomain}/admin/themes/${themeId}/editor?template=product&addAppBlock=${EXTENSION_UUID}/curtain_calculator`;

    return {
      metafieldsExist: allExist,
      cartTransformActive,
      demoProductExists,
      pricingComponentExists,
      componentVariantId,
      componentMetaDefExists,
      themeEditorUrl,
      shopDomain,
    };
  } catch (error) {
    console.error("Loader Error:", error);
    return {
      metafieldsExist: false,
      cartTransformActive: false,
      demoProductExists: false,
      pricingComponentExists: false,
      componentVariantId: null,
      componentMetaDefExists: false,
      themeEditorUrl: "",
      shopDomain: "",
    };
  }
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("_action");

  // ─── Step 2: Create Demo Curtain Product ───────────────────────────────────
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
        return { success: false, errors: data.data.productSet.userErrors };
      }
      if (data.errors) {
        return { success: false, errors: data.errors };
      }

      const productId = data.data?.productSet?.product?.id;
      if (productId) {
        const SET_METAFIELDS_MUTATION = `
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { field message }
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
      return { success: false, errors: [{ message: error.message || "Unknown error" }] };
    }
  }

  // ─── Step 3: Create / Refresh Pricing Component ──────────────────────────
  if (actionType === "create_pricing_component" || actionType === "refresh_pricing_component") {
    try {
      // 1. Get shop ID + Online Store publication ID
      const SHOP_AND_PUBS = `
        query {
          shop { id }
          publications(first: 10) {
            nodes { id name }
          }
        }
      `;
      const shopRes = await admin.graphql(SHOP_AND_PUBS);
      const shopData = await shopRes.json() as any;
      const shopId = shopData.data?.shop?.id;
      const onlineStorePub = shopData.data?.publications?.nodes?.find(
        (p: any) => p.name === "Online Store"
      );

      // 2. Check if "Curtain Pricing Component" already exists (idempotent)
      const FIND_COMPONENT = `
        query {
          products(first: 1, query: "title:'Curtain Pricing Component'") {
            nodes { id }
          }
        }
      `;
      const findRes = await admin.graphql(FIND_COMPONENT);
      const findData = await findRes.json() as any;
      let productId = findData.data?.products?.nodes?.[0]?.id;

      // 3. Create product only if it doesn't exist
      if (!productId) {
        const CREATE_COMPONENT = `
          mutation CreatePricingComponent($input: ProductSetInput!) {
            productSet(input: $input) {
              product { id }
              userErrors { field message }
            }
          }
        `;
        const compRes = await admin.graphql(CREATE_COMPONENT, {
          variables: {
            input: {
              title: "Curtain Pricing Component",
              status: "ACTIVE",
            }
          }
        });
        const compData = await compRes.json() as any;

        if (compData.data?.productSet?.userErrors?.length > 0) {
          return { success: false, errors: compData.data.productSet.userErrors };
        }

        productId = compData.data?.productSet?.product?.id;
        if (!productId) {
          return { success: false, errors: [{ message: "Failed to create pricing component product." }] };
        }
      }

      // 4. Publish to Online Store — REQUIRED for Cart Transform lineExpand to work.
      //    The component variant must have availableForSale: true, which needs publication.
      //    This is idempotent — safe to call even if already published.
      if (onlineStorePub) {
        const PUBLISH = `
          mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { field message }
            }
          }
        `;
        await admin.graphql(PUBLISH, {
          variables: {
            id: productId,
            input: [{ publicationId: onlineStorePub.id }]
          }
        });
      }

      // 5. Get the current variant ID (always fresh — in case product was recreated)
      const GET_VARIANT = `
        query GetVariant($id: ID!) {
          product(id: $id) {
            variants(first: 1) { nodes { id } }
          }
        }
      `;
      const variantRes = await admin.graphql(GET_VARIANT, { variables: { id: productId } });
      const variantData = await variantRes.json() as any;
      const variantId = variantData.data?.product?.variants?.nodes?.[0]?.id;

      if (!variantId) {
        return { success: false, errors: [{ message: "Could not retrieve variant ID from pricing component." }] };
      }

      // 6. Create shop metafield DEFINITION (required for Shopify Functions to read it).
      //    Ignore "already exists" errors — this is idempotent.
      const CREATE_SHOP_META_DEF = `
        mutation CreateShopMetafieldDef($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { field message code }
          }
        }
      `;
      await admin.graphql(CREATE_SHOP_META_DEF, {
        variables: {
          definition: {
            name: "GBI Pricing Component Variant ID",
            namespace: "gbi_curtain_pricing",
            key: "component_variant_id",
            description: "Variant ID used by Cart Transform function to apply calculated prices",
            type: "single_line_text_field",
            ownerType: "SHOP",
          }
        }
      });
      // (errors intentionally ignored — definition may already exist)

      // 7. Store the CURRENT variant ID in the shop metafield
      const SET_SHOP_METAFIELD = `
        mutation SetShopMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { key value }
            userErrors { field message }
          }
        }
      `;
      const metafieldRes = await admin.graphql(SET_SHOP_METAFIELD, {
        variables: {
          metafields: [{
            ownerId: shopId,
            namespace: "gbi_curtain_pricing",
            key: "component_variant_id",
            value: variantId,
            type: "single_line_text_field"
          }]
        }
      });
      const metafieldData = await metafieldRes.json() as any;
      if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
        return { success: false, errors: metafieldData.data.metafieldsSet.userErrors };
      }

      const storedValue = metafieldData.data?.metafieldsSet?.metafields?.[0]?.value;
      return { success: true, type: "pricing_component_created", variantId: storedValue || variantId };
    } catch (error: any) {
      console.error("create_pricing_component error:", error);
      return { success: false, errors: [{ message: error.message || "Unknown error" }] };
    }
  }


  // ─── Step 4: Activate Cart Transform ──────────────────────────────────────
  if (actionType === "activate_cart_transform") {
    try {
      const GET_FUNCTIONS = `
        query {
          shopifyFunctions(first: 10) {
            nodes { id apiType title }
          }
        }
      `;
      const funcRes = await admin.graphql(GET_FUNCTIONS);
      const funcData = await funcRes.json() as any;

      const cartFunction = funcData.data?.shopifyFunctions?.nodes?.find(
        (f: any) => f.apiType === "cart_transform" || f.title.toLowerCase().includes("gbi")
      );

      if (!cartFunction) {
        return { success: false, errors: [{ message: "Cart Transform function not found. Did you deploy the extension?" }] };
      }

      const CREATE_TRANSFORM = `
        mutation cartTransformCreate($functionId: String!) {
          cartTransformCreate(functionId: $functionId) {
            cartTransform { id functionId }
            userErrors { field message }
          }
        }
      `;
      const res = await admin.graphql(CREATE_TRANSFORM, { variables: { functionId: cartFunction.id } });
      const data = await res.json() as any;

      if (data.data?.cartTransformCreate?.userErrors?.length > 0) {
        const errMsg = data.data.cartTransformCreate.userErrors[0].message as string;
        if (errMsg.toLowerCase().includes("already")) {
          return { success: true, type: "cart_transform_activated" };
        }
        return { success: false, errors: data.data.cartTransformCreate.userErrors };
      }

      return { success: true, type: "cart_transform_activated" };
    } catch (error: any) {
      return { success: false, errors: [{ message: error.message || "Unknown error" }] };
    }
  }

  // ─── Step 1: Initialize Metafield Definitions ─────────────────────────────
  const CREATE_METAFIELD_DEFINITION = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id name }
        userErrors { field message }
      }
    }
  `;

  const definitions = [
    { name: "Fabric Roll Width", namespace: "custom", key: "fabric_roll_width", description: "Width of the fabric roll", type: "number_integer", ownerType: "PRODUCT" },
    { name: "Vertical Pattern Repeat", namespace: "custom", key: "vertical_pattern_repeat", description: "Vertical pattern repeat size", type: "number_integer", ownerType: "PRODUCT" },
    { name: "Fabric Cost Per Metre", namespace: "custom", key: "fabric_cost_per_metre", description: "Cost of the fabric per metre", type: "number_decimal", ownerType: "PRODUCT" }
  ];

  let successCount = 0;
  let errors: any[] = [];

  for (const def of definitions) {
    try {
      const response = await admin.graphql(CREATE_METAFIELD_DEFINITION, { variables: { definition: def } });
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
  const componentFetcher = useFetcher<typeof action>();
  const transformFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const {
    metafieldsExist,
    cartTransformActive,
    demoProductExists,
    pricingComponentExists,
    componentVariantId,
    componentMetaDefExists,
    themeEditorUrl,
  } = useLoaderData<typeof loader>();

  const isSetupComplete = metafieldsExist || (metafieldFetcher.data?.type === "metafields_created" && metafieldFetcher.data?.success);
  const productCreated = demoProductExists || (productFetcher.data?.type === "product_created" && productFetcher.data?.success);
  const pricingComponentCreated = pricingComponentExists || (componentFetcher.data?.type === "pricing_component_created" && componentFetcher.data?.success);
  const transformActivated = cartTransformActive || (transformFetcher.data?.type === "cart_transform_activated" && transformFetcher.data?.success);

  // Show stored variant ID (from action response or loader)
  const latestVariantId = (componentFetcher.data as any)?.variantId || componentVariantId;

  useEffect(() => {
    if (metafieldFetcher.data && metafieldFetcher.state === "idle") {
      if (metafieldFetcher.data.success) shopify.toast.show("Metafields initialized successfully!");
      else shopify.toast.show(metafieldFetcher.data.errors?.[0]?.message ?? "Error", { isError: true });
    }
  }, [metafieldFetcher.data, metafieldFetcher.state, shopify]);

  useEffect(() => {
    if (productFetcher.data && productFetcher.state === "idle") {
      if (productFetcher.data.success) shopify.toast.show("Demo product created successfully!");
      else shopify.toast.show(productFetcher.data.errors?.[0]?.message ?? "Error", { isError: true });
    }
  }, [productFetcher.data, productFetcher.state, shopify]);

  useEffect(() => {
    if (componentFetcher.data && componentFetcher.state === "idle") {
      if (componentFetcher.data.success) {
        const msg = (componentFetcher.data as any)?.variantId
          ? `✅ Pricing Component synced! Variant: ${(componentFetcher.data as any).variantId.split("/").pop()}`
          : "Pricing Component ready! Cart Transform engine is now active.";
        shopify.toast.show(msg);
      } else {
        shopify.toast.show(componentFetcher.data.errors?.[0]?.message ?? "Error", { isError: true });
      }
    }
  }, [componentFetcher.data, componentFetcher.state, shopify]);

  useEffect(() => {
    if (transformFetcher.data && transformFetcher.state === "idle") {
      if (transformFetcher.data.success) shopify.toast.show("Cart Transform Activated! Pricing is now live.");
      else shopify.toast.show(transformFetcher.data.errors?.[0]?.message ?? "Error", { isError: true });
    }
  }, [transformFetcher.data, transformFetcher.state, shopify]);

  return (
    <s-page heading="GBI Curtain Pricing">
      <s-section heading="Welcome to GBI Curtain Pricing 🪟">
        <s-paragraph>
          GBI Curtain Pricing enables dynamic, rule-based pricing at checkout
          for curtain products. Using Shopify's Cart Transform API (lineExpand),
          this app applies the calculated price as a bundle component—compatible
          with all Shopify plans including Basic.
        </s-paragraph>
      </s-section>

      {/* ── Step 1: Metafields ── */}
      <s-section heading="1. App Setup (Required)">
        <s-paragraph>
          Create the required product metafields (fabric roll width, pattern repeat, fabric cost).
        </s-paragraph>
        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          <s-button
            variant={isSetupComplete ? "secondary" : "primary"}
            onClick={() => metafieldFetcher.submit({ _action: "create_metafields" }, { method: "post" })}
            loading={metafieldFetcher.state === "submitting" ? true : undefined}
            disabled={isSetupComplete ? true : undefined}
          >
            {metafieldFetcher.state === "submitting" ? "Setting up..." : isSetupComplete ? "Metafields Setup Complete ✅" : "Initialize Required Metafields"}
          </s-button>
        </div>
        <s-paragraph>
          <s-text tone="neutral">
            Creates: <b>custom.fabric_roll_width</b>, <b>custom.vertical_pattern_repeat</b>, <b>custom.fabric_cost_per_metre</b>.
          </s-text>
        </s-paragraph>
      </s-section>

      {/* ── Step 2: Pricing Component ── */}
      <s-section heading="2. Create Pricing Component (Required)">
        <s-paragraph>
          This creates a hidden "Curtain Pricing Component" product in your store.
          Its variant ID is stored as a shop metafield so the Cart Transform function
          can use it to apply the calculated price at checkout—without needing Shopify Plus.
        </s-paragraph>
        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          {pricingComponentCreated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <s-button variant="secondary" disabled>Pricing Component Ready ✅</s-button>
              <s-text tone="success">
                Component product created. Metafield definition exists — Cart Transform engine can apply calculated prices.
              </s-text>
              {latestVariantId && (
                <s-text tone="neutral">
                  Stored Variant ID: <b>{latestVariantId}</b>
                </s-text>
              )}
              {/* Refresh button — re-sync variant ID if product was deleted/recreated */}
              <s-button
                variant="secondary"
                onClick={() => componentFetcher.submit({ _action: "refresh_pricing_component" }, { method: "post" })}
                loading={componentFetcher.state === "submitting" ? true : undefined}
              >
                {componentFetcher.state === "submitting" ? "Refreshing..." : "🔄 Refresh / Re-sync Pricing Component"}
              </s-button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Show warning if value exists but definition is missing */}
              {componentVariantId && !componentMetaDefExists && (
                <s-text tone="critical">
                  ⚠️ Variant ID is stored but metafield definition is missing — Cart Transform Function cannot read it! Click below to fix.
                </s-text>
              )}
              <s-button
                onClick={() => componentFetcher.submit({ _action: "create_pricing_component" }, { method: "post" })}
                loading={componentFetcher.state === "submitting" ? true : undefined}
                disabled={!isSetupComplete ? true : undefined}
              >
                {componentFetcher.state === "submitting" ? "Setting up..." : componentVariantId ? "Fix & Re-sync Pricing Component" : "Create Pricing Component"}
              </s-button>
              {!isSetupComplete && (
                <s-text tone="critical">Please complete Step 1 first.</s-text>
              )}
            </div>
          )}
        </div>
      </s-section>

      {/* ── Step 3: Demo Product ── */}
      <s-section heading="3. Create Demo Curtain Product">
        <s-paragraph>
          Generate a test curtain product with all variant combinations (Lining × Style) pre-configured.
        </s-paragraph>
        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          {productCreated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <s-button variant="secondary" disabled>Demo Product Created ✅</s-button>
              <s-text tone="success">Go to Shopify Admin → Products to view and assign the Calculator block.</s-text>
            </div>
          ) : (
            <>
              <s-button
                onClick={() => productFetcher.submit({ _action: "create_demo_product" }, { method: "post" })}
                loading={productFetcher.state === "submitting" ? true : undefined}
                disabled={!pricingComponentCreated ? true : undefined}
              >
                Create Demo Product
              </s-button>
              {!pricingComponentCreated && (
                <div style={{ marginTop: '5px' }}>
                  <s-text tone="critical">Please complete Step 2 first.</s-text>
                </div>
              )}
            </>
          )}
        </div>
      </s-section>

      {/* ── Step 4: Activate Backend ── */}
      <s-section heading="4. Activate Backend Pricing">
        <s-paragraph>
          Register the Cart Transform function on this store. Must be done after every fresh deploy.
        </s-paragraph>
        <div style={{ marginTop: '15px' }}>
          {transformActivated ? (
            <s-button variant="secondary" disabled>Pricing Backend Active ✅</s-button>
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
      {/* ── Step 5: Add Calculator Block to Theme ── */}
      <s-section heading="5. Add Calculator Block to Product Page (Required for Reviewers)">
        <s-paragraph>
          The GBI Curtain Calculator is a Theme App Extension block. It must be added to the
          product page template in the Theme Editor before it will appear on any product.
          Click the button below to open the Theme Editor — the block will be pre-selected
          and ready to drop in.
        </s-paragraph>

        <div style={{ marginTop: '16px', marginBottom: '8px', background: '#f4f6f8', borderRadius: '8px', padding: '16px' }}>
          <s-text tone="neutral">
            <b>Steps once the Theme Editor opens:</b>
          </s-text>
          <ol style={{ marginTop: '8px', marginLeft: '20px', lineHeight: '1.8' }}>
            <li>In the left sidebar, click <b>"Product information"</b> section to expand it.</li>
            <li>Click <b>"Add block"</b> (the blue + button inside the section).</li>
            <li>Under <b>"Apps"</b>, select <b>"GBI Curtain Calculator"</b>.</li>
            <li>Drag it to sit between <b>Variant picker</b> and <b>Quantity selector</b>.</li>
            <li>Click <b>Save</b> in the top-right corner.</li>
          </ol>
        </div>

        <div style={{ marginTop: '15px' }}>
          <s-button
            variant="primary"
            onClick={() => {
              if (themeEditorUrl) {
                window.open(themeEditorUrl, '_blank');
              }
            }}
            disabled={!themeEditorUrl ? true : undefined}
          >
            🎨 Open Theme Editor → Add Calculator Block
          </s-button>
        </div>

        <div style={{ marginTop: '12px' }}>
          <s-text tone="neutral">
            ℹ️ Repeat this step for <b>every curtain product</b> where you want the calculator to appear.
            The block reads metafields (Fabric Cost, Roll Width, Pattern Repeat) set per product.
          </s-text>
        </div>
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
