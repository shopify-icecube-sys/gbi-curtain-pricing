import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR Mandatory Webhook: Customer Data Request
// Shopify App Store submission ke liye required hai
// Jab koi customer apna data request kare toh yahan handle karo
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer data request payload:", JSON.stringify(payload));

  // TODO: Agar app customer data store karta hai toh yahan
  // us customer ka data email/export karne ki logic add karo.
  // Is app mein abhi customer data store nahi hota, isliye 200 return karo.

  return new Response();
};
