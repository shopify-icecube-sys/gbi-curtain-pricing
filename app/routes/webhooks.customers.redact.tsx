import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GDPR Mandatory Webhook: Customer Redact
// Shopify App Store submission ke liye required hai
// Jab koi customer apna data delete karne ka request kare
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer redact payload:", JSON.stringify(payload));

  // TODO: Agar app customer data store karta hai toh yahan
  // us customer ka data permanently delete karne ki logic add karo.
  // Is app mein abhi customer data store nahi hota, isliye 200 return karo.

  return new Response();
};
