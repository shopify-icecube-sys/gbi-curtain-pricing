import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR Mandatory Webhook: Shop Redact
// Shopify App Store submission ke liye required hai
// App uninstall hone ke 48 hrs baad Shopify ye webhook bhejta hai
// Is point pe shop ka saara data delete karna hota hai
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Shop redact payload:", JSON.stringify(payload));

  // TODO: Agar app shop-level data (settings, configs, etc.) store karta hai
  // toh yahan us shop ka saara data permanently delete karne ki logic add karo.
  // Is app mein abhi extra shop data store nahi hota, isliye 200 return karo.

  return new Response();
};
