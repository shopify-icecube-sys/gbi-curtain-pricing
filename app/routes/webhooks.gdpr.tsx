import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Single GDPR/Privacy Compliance Webhook Handler
// Handles: customers/data_request, customers/redact, shop/redact
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received GDPR webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // Customer ne apna data request kiya
      // TODO: Agar customer data store karte ho toh yahan export karo
      console.log("Customer data request for shop:", shop, payload);
      break;

    case "CUSTOMERS_REDACT":
      // Customer ne apna data delete karne ka request kiya
      // TODO: Agar customer data store karte ho toh yahan delete karo
      console.log("Customer redact request for shop:", shop, payload);
      break;

    case "SHOP_REDACT":
      // App uninstall ke 48 hrs baad — shop ka saara data delete karo
      // TODO: Agar shop-level data store karte ho toh yahan delete karo
      console.log("Shop redact request for shop:", shop, payload);
      break;

    default:
      console.log(`Unhandled GDPR topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
