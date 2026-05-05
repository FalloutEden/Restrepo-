import "server-only";

import type { BrandPolicyConfig } from "@/lib/policies-config";

// All policy bodies are HTML — Shopify renders the policy body via the
// shopPolicyUpdate mutation directly into the storefront. Keep markup simple
// (h2/h3/p/ul/li/strong/a) so themes style it cleanly.

export type ShopifyPolicyType =
  | "PRIVACY_POLICY"
  | "TERMS_OF_SERVICE"
  | "REFUND_POLICY"
  | "SHIPPING_POLICY"
  | "CONTACT_INFORMATION";

export type GeneratedPolicy = {
  type: ShopifyPolicyType;
  title: string;
  body: string; // HTML
  filename: string; // e.g. "privacy.html"
};

function lastUpdated(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fulfillmentLabel(config: BrandPolicyConfig): string {
  return config.fulfillmentPartner === "printful" ? "Printful" : "CJ Dropshipping";
}

function fulfillmentDescription(config: BrandPolicyConfig): string {
  return config.fulfillmentPartner === "printful"
    ? "an on-demand print and apparel manufacturing partner"
    : "a global product sourcing and fulfillment partner";
}

function disputeVenue(config: BrandPolicyConfig): string {
  return `${config.governingState}, ${config.governingCountry}`;
}

function notice(config: BrandPolicyConfig): string {
  if (!config.noticeBanner) return "";
  return `<p><strong>Notice:</strong> ${config.noticeBanner}</p>`;
}

// ── Privacy Policy ────────────────────────────────────────────────────────

export function generatePrivacyPolicy(config: BrandPolicyConfig): GeneratedPolicy {
  const fulfillment = fulfillmentLabel(config);
  const body = `
${notice(config)}
<p><em>Last updated ${lastUpdated()}</em></p>

<p>This Privacy Policy describes how ${config.legalEntity} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares personal information when you visit our online store, place an order, or otherwise interact with us. We are based in ${config.governingState}, ${config.governingCountry}.</p>

<h2>1. Information we collect</h2>
<p>We collect information you provide directly, information collected automatically when you use our store, and information from third parties that help us operate the business.</p>
<ul>
  <li><strong>Account and contact information.</strong> Name, email address, shipping and billing address, and phone number when you create an account, place an order, or contact support.</li>
  <li><strong>Order information.</strong> Items purchased, order value, payment method type (we do not store full card numbers), and shipping details.</li>
  <li><strong>Device and usage information.</strong> IP address, browser type, pages viewed, referring URL, and approximate location, collected through cookies and similar technologies.</li>
  <li><strong>Communications.</strong> Messages you send to us via email or store contact forms.</li>
</ul>

<h2>2. How we use your information</h2>
<ul>
  <li>To process orders, deliver products, and provide customer support.</li>
  <li>To send order confirmations, shipping updates, and service announcements.</li>
  <li>To send marketing communications when you have opted in. You can unsubscribe at any time.</li>
  <li>To detect, prevent, and respond to fraud or misuse of our store.</li>
  <li>To improve our products, store experience, and operations.</li>
  <li>To comply with legal obligations and enforce our terms.</li>
</ul>

<h2>3. How we share your information</h2>
<p>We share personal information only with service providers who help us run the business, and only as needed to provide that service:</p>
<ul>
  <li><strong>Shopify</strong> hosts our store and processes payments. Your payment information is handled directly by Shopify Payments and any other payment processor you choose at checkout.</li>
  <li><strong>${fulfillment}</strong>, ${fulfillmentDescription(config)}, receives the shipping address and items needed to produce and deliver your order.</li>
  <li><strong>Email and SMS providers</strong> deliver transactional and (if you opt in) marketing messages.</li>
  <li><strong>Analytics providers</strong> help us understand how the store is used. These may include cookie-based services that aggregate visitor behavior.</li>
  <li><strong>Law enforcement, regulators, or other parties</strong> when we are legally required to do so, or to protect the rights, property, or safety of ${config.legalEntity}, our customers, or others.</li>
</ul>
<p>We do not sell your personal information for money.</p>

<h2>4. Cookies and tracking</h2>
<p>We use cookies and similar technologies to keep you signed in, remember your cart, measure store performance, and (with your consent where required) personalize marketing. You can disable cookies in your browser settings, but parts of the store may not work correctly without them.</p>

<h2>5. Your rights and choices</h2>
<p>Depending on where you live, you may have rights to:</p>
<ul>
  <li>Access the personal information we hold about you.</li>
  <li>Correct or update inaccurate information.</li>
  <li>Request deletion of your information.</li>
  <li>Opt out of marketing communications.</li>
  <li>Object to or restrict certain processing.</li>
</ul>
<p>To exercise any of these rights, email us at <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>. We will respond within the time frame required by applicable law (typically 30&ndash;45 days). We may need to verify your identity before fulfilling the request.</p>
<p><strong>California residents</strong> have specific rights under the California Consumer Privacy Act (CCPA), including the right to request information about the categories of personal information we have collected, sold, or disclosed for a business purpose.</p>
<p><strong>EU and UK residents</strong> have rights under the GDPR / UK GDPR, including the right to lodge a complaint with your local data protection authority.</p>

<h2>6. Children</h2>
<p>Our store is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe we may have, please email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> and we will delete it.</p>

<h2>7. International data transfers</h2>
<p>We are based in the ${config.governingCountry}, and our service providers may process data in the United States and other countries. By using our store you consent to your information being transferred to and processed in these locations.</p>

<h2>8. Security</h2>
<p>We use industry-standard safeguards to protect personal information, including encrypted connections (HTTPS) and access controls on our systems. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>

<h2>9. Retention</h2>
<p>We keep personal information for as long as needed to provide the services, comply with legal obligations, resolve disputes, and enforce our agreements.</p>

<h2>10. Changes to this Policy</h2>
<p>We may update this Privacy Policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date. Material changes will be communicated through the store or by email when appropriate.</p>

<h2>11. Contact us</h2>
<p>Questions about this Privacy Policy? Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>.</p>
`.trim();

  return {
    type: "PRIVACY_POLICY",
    title: "Privacy Policy",
    body,
    filename: "privacy.html"
  };
}

// ── Terms of Service ──────────────────────────────────────────────────────

export function generateTermsOfService(config: BrandPolicyConfig): GeneratedPolicy {
  const securityClause = config.includeSecurityLiabilityDisclaimer
    ? `
<h2>14. Security products are aids, not guarantees</h2>
<p>Many of our products are designed to assist with home or property security. <strong>They are aids only and do not guarantee prevention of theft, intrusion, property damage, or personal injury.</strong> No security device, alarm, sensor, lock, or camera is foolproof, and no manufacturer or retailer can guarantee that a determined intruder, fire, accident, or other event will be stopped or recorded. To the fullest extent permitted by law, ${config.legalEntity} is not liable for any property loss, theft, damage, injury, business interruption, or other harm arising from the use, malfunction, misuse, or failure of any product purchased from us. Customers are responsible for installing, configuring, maintaining, and testing products in accordance with the manufacturer&rsquo;s instructions.</p>
`.trim()
    : "";

  const body = `
${notice(config)}
<p><em>Last updated ${lastUpdated()}</em></p>

<p>These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the ${config.legalEntity} online store and any orders you place with us. By accessing the store or placing an order, you agree to these Terms.</p>

<h2>1. Eligibility</h2>
<p>You must be at least ${config.minimumAge} years old, or the age of majority where you live, to place an order. By placing an order, you confirm that you meet this requirement and that the information you provide is accurate.</p>

<h2>2. Account registration</h2>
<p>You can shop as a guest or create an account. If you create an account, you are responsible for keeping your login credentials secure and for any activity under your account.</p>

<h2>3. Products and pricing</h2>
<p>Product descriptions, photos, and colors are provided in good faith and are intended to be accurate, but we do not warrant that they are error-free or complete. Colors may appear differently on different screens. Prices are listed in U.S. dollars unless stated otherwise and may change at any time before an order is placed. Sales tax is calculated and added at checkout where applicable.</p>

<h2>4. Orders</h2>
<p>An order placed through the store is an offer to buy. We reserve the right to accept or decline any order, including for reasons such as product availability, pricing errors, suspected fraud, or shipping restrictions. You will receive an order confirmation by email when your order is accepted.</p>
<p>Once an order has entered fulfillment, we may not be able to cancel or change it. Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> as soon as possible if you need to make a change.</p>

<h2>5. Payment</h2>
<p>Payment is processed at checkout through Shopify Payments and other payment options we offer. By placing an order, you authorize us to charge the payment method you provide for the full order amount, including taxes and shipping.</p>

<h2>6. Shipping</h2>
<p>Shipping terms, processing times, and rates are described in our Shipping Policy, which is incorporated into these Terms by reference.</p>

<h2>7. Returns and refunds</h2>
<p>Returns and refunds are governed by our Refund Policy, which is incorporated into these Terms by reference.</p>

<h2>8. Intellectual property</h2>
<p>All content on the store &mdash; including the ${config.legalEntity} name, logos, designs, photos, copy, and other materials &mdash; is owned by ${config.legalEntity} or our licensors and is protected by copyright, trademark, and other intellectual property laws. You may not copy, reproduce, or use any of this content for commercial purposes without written permission.</p>

<h2>9. User content</h2>
<p>If you submit reviews, comments, photos, or other content to the store, you grant ${config.legalEntity} a non-exclusive, royalty-free, worldwide license to use, display, reproduce, and distribute that content in connection with our store and marketing. You represent that you have the rights to grant this license.</p>

<h2>10. Prohibited uses</h2>
<p>You agree not to use the store to:</p>
<ul>
  <li>Violate any law or regulation.</li>
  <li>Infringe on the rights of others.</li>
  <li>Submit false, misleading, or fraudulent information.</li>
  <li>Upload viruses or other malicious code.</li>
  <li>Attempt to access systems, accounts, or data you are not authorized to access.</li>
  <li>Interfere with the operation of the store or other users.</li>
</ul>

<h2>11. Disclaimer of warranties</h2>
<p>The store and the products are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the fullest extent permitted by law, ${config.legalEntity} disclaims all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. Any manufacturer warranty offered with a product is between you and the manufacturer.</p>

<h2>12. Limitation of liability</h2>
<p>To the fullest extent permitted by law, ${config.legalEntity} and its owners, employees, and agents will not be liable for indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, or data, arising out of or related to your use of the store or any product. Our total liability for any claim arising out of or related to the store or a product will not exceed the amount you paid for the product giving rise to the claim.</p>

<h2>13. Indemnification</h2>
<p>You agree to indemnify and hold ${config.legalEntity} harmless from any claims, damages, losses, or expenses (including reasonable legal fees) arising out of your breach of these Terms, your misuse of a product, or your violation of any law or third-party right.</p>
${securityClause}

<h2>${config.includeSecurityLiabilityDisclaimer ? 15 : 14}. Governing law and dispute resolution</h2>
<p>These Terms are governed by the laws of ${config.governingState}, ${config.governingCountry}, without regard to conflict-of-laws principles.</p>
<p>Any dispute arising out of or related to these Terms or your use of the store will first be addressed through good-faith communication with our support team. If a dispute cannot be resolved informally, it will be settled by binding arbitration administered in ${config.governingState}, ${config.governingCountry}, except that either party may bring an individual claim in small-claims court if eligible. <strong>You and ${config.legalEntity} agree that any dispute resolution proceedings will be conducted only on an individual basis and not as a class, consolidated, or representative action.</strong></p>

<h2>${config.includeSecurityLiabilityDisclaimer ? 16 : 15}. Termination</h2>
<p>We may suspend or terminate your access to the store at any time for any reason, including violation of these Terms. The provisions of these Terms that by their nature should survive termination will survive.</p>

<h2>${config.includeSecurityLiabilityDisclaimer ? 17 : 16}. Changes to these Terms</h2>
<p>We may update these Terms from time to time. The updated version will be posted on this page with a new &ldquo;Last updated&rdquo; date. Continued use of the store after the change means you accept the updated Terms.</p>

<h2>${config.includeSecurityLiabilityDisclaimer ? 18 : 17}. Severability and entire agreement</h2>
<p>If any provision of these Terms is held unenforceable, the remaining provisions will remain in effect. These Terms, together with our Privacy Policy, Shipping Policy, and Refund Policy, are the entire agreement between you and ${config.legalEntity} regarding the store.</p>

<h2>${config.includeSecurityLiabilityDisclaimer ? 19 : 18}. Contact</h2>
<p>Questions about these Terms? Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>.</p>
`.trim();

  return {
    type: "TERMS_OF_SERVICE",
    title: "Terms of Service",
    body,
    filename: "terms.html"
  };
}

// ── Refund / Return Policy ────────────────────────────────────────────────

export function generateRefundPolicy(config: BrandPolicyConfig): GeneratedPolicy {
  const isPod = config.fulfillmentPartner === "printful";

  const fulfillmentSpecific = isPod
    ? `
<h2>Print-on-demand items</h2>
<p>Our apparel is printed and assembled to order. Because each item is made specifically for you, we are not able to restock it. This affects how returns work:</p>
<ul>
  <li><strong>Manufacturing defects, print errors, or damage in transit:</strong> we&rsquo;ll send a free replacement or issue a full refund. Email a photo of the issue and we&rsquo;ll handle it.</li>
  <li><strong>Wrong size ordered:</strong> our size charts are listed on every product page. If you ordered the wrong size, you can return the item within ${config.returnsWindowDays} days for a refund minus original shipping. Return shipping is paid by the customer.</li>
  <li><strong>Change of mind:</strong> we accept returns within ${config.returnsWindowDays} days as long as the item is unworn, unwashed, and has all tags attached. The customer pays return shipping.</li>
</ul>
`.trim()
    : `
<h2>Tech and security products</h2>
<p>Our tech products ship through global fulfillment partners. Their handling rules are reflected here:</p>
<ul>
  <li><strong>Defective on arrival or wrong item:</strong> we&rsquo;ll send a free replacement or issue a full refund. Email photos and we&rsquo;ll handle it.</li>
  <li><strong>Unopened items returned within ${config.returnsWindowDays} days:</strong> eligible for a refund. Customer pays return shipping. Item must be in original packaging with all accessories.</li>
  <li><strong>Opened or used items:</strong> only eligible for refund or replacement if the item is defective. Once opened and used, items cannot be restocked.</li>
  <li><strong>Items damaged by misuse, accident, or unauthorized modification:</strong> not eligible for return.</li>
</ul>
`.trim();

  const body = `
${notice(config)}
<p><em>Last updated ${lastUpdated()}</em></p>

<p>We want every order to feel like a good purchase. If something arrived wrong, broken, or just isn&rsquo;t right, we&rsquo;ll work with you to make it right. This policy explains how returns and refunds work at ${config.legalEntity}.</p>

<h2>Return window</h2>
<p>You have <strong>${config.returnsWindowDays} days from the delivery date</strong> to request a return.</p>

<h2>How to start a return</h2>
<ol>
  <li>Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> with your order number and a brief description of the issue.</li>
  <li>If the issue is a defect, wrong item, or shipping damage, please attach photos.</li>
  <li>We&rsquo;ll reply within 1&ndash;2 business days with next steps and (if needed) the return address.</li>
</ol>

<h2>Return shipping costs</h2>
<ul>
  <li><strong>Defective, wrong, or damaged items:</strong> we cover return shipping.</li>
  <li><strong>All other returns (size, change of mind, fit):</strong> the customer is responsible for return shipping.</li>
</ul>

${fulfillmentSpecific}

<h2>Refunds</h2>
<p>Once we receive and inspect the returned item, we&rsquo;ll send a confirmation email. Approved refunds are issued to the original payment method within <strong>5&ndash;10 business days</strong>. Depending on your bank, it may take additional time for the credit to appear on your statement.</p>

<h2>Late or missing refunds</h2>
<p>If you haven&rsquo;t received an expected refund, first check with your bank or credit card company &mdash; processing times can vary. If you&rsquo;ve done that and still don&rsquo;t see the refund, email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> and we&rsquo;ll look into it.</p>

<h2>Exchanges</h2>
<p>The fastest way to get a different size or item is to place a new order and return the original. This avoids the wait for inspection before re-shipping.</p>

<h2>Sale and final-sale items</h2>
<p>Items marked &ldquo;final sale&rdquo; on the product page are not returnable except in the case of defects, errors, or shipping damage.</p>

<h2>Lost or stolen packages</h2>
<p>Once a package is marked delivered by the carrier, responsibility passes to the customer. If a package is missing or shows incorrect tracking, contact <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> and we will help you open a claim with the carrier.</p>

<h2>Questions</h2>
<p>Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>. We respond within 1&ndash;2 business days.</p>
`.trim();

  return {
    type: "REFUND_POLICY",
    title: "Refund Policy",
    body,
    filename: "refund.html"
  };
}

// ── Shipping Policy ───────────────────────────────────────────────────────

export function generateShippingPolicy(config: BrandPolicyConfig): GeneratedPolicy {
  const isPod = config.fulfillmentPartner === "printful";
  const productionLine = isPod
    ? `<p>Our apparel is printed and assembled to order. Production typically takes <strong>${config.productionDays.min}&ndash;${config.productionDays.max} business days</strong> before the package leaves the facility. Shipping time is added on top of that.</p>`
    : `<p>Our products ship from global warehouses operated by our fulfillment partner. Order processing typically takes <strong>${config.productionDays.min}&ndash;${config.productionDays.max} business days</strong> before the package leaves the warehouse. Shipping time is added on top of that.</p>`;

  const body = `
${notice(config)}
<p><em>Last updated ${lastUpdated()}</em></p>

<p>This Shipping Policy explains how and when your order will arrive after you place it with ${config.legalEntity}.</p>

<h2>Where we ship</h2>
<p>We ship within the United States and to most international destinations. Available destinations and rates are calculated at checkout based on your shipping address and the items in your cart.</p>

<h2>Order processing</h2>
${productionLine}
<p>You&rsquo;ll receive a tracking number by email as soon as your order ships.</p>

<h2>Shipping methods and rates</h2>
<p>Available shipping methods (standard, expedited where offered) and their rates are shown at checkout based on your destination, the items in your cart, and the carrier&rsquo;s current pricing. Free or discounted shipping promotions, when active, will appear automatically on the cart page.</p>

<h2>Estimated delivery times</h2>
<ul>
  <li><strong>United States:</strong> typically ${isPod ? "3&ndash;7" : "5&ndash;15"} business days after the package ships.</li>
  <li><strong>International:</strong> typically 7&ndash;21 business days after the package ships, depending on the destination country and customs processing.</li>
</ul>
<p>These windows are estimates from our shipping partners, not guarantees. Carriers may experience delays from weather, holidays, customs, or operational issues outside our control.</p>

<h2>Tracking</h2>
<p>Tracking numbers are emailed automatically when your order ships. If your tracking shows no movement for more than 7 business days, email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> and we&rsquo;ll investigate with the carrier.</p>

<h2>International orders, customs, and duties</h2>
<p>International orders may be subject to import duties, taxes, and customs fees levied by the destination country. <strong>These fees are the responsibility of the customer and are not included in the price you pay at checkout.</strong> Customs procedures may also delay delivery beyond the estimated transit time.</p>
<p>If a package is refused or returned because of unpaid duties, refunds will be issued (less original shipping costs) once the package is received back at the fulfillment center.</p>

<h2>Address accuracy</h2>
<p>Please double-check your shipping address before placing your order. We are not able to guarantee changes once an order has entered fulfillment. If a package is returned to us due to an incorrect address, we will reach out to arrange reshipment (re-shipping fees may apply).</p>

<h2>Lost, stolen, or delayed packages</h2>
<p>If a package is marked delivered but you cannot find it, please:</p>
<ol>
  <li>Check with neighbors and household members.</li>
  <li>Look around the property &mdash; entryways, side doors, garages.</li>
  <li>Wait 24 hours, since carriers occasionally mark packages delivered before final drop-off.</li>
  <li>Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> and we will help you open a claim with the carrier.</li>
</ol>
<p>For packages that are visibly delayed or missing in transit, we will work with the carrier and our fulfillment partner to locate the shipment or arrange a replacement.</p>

<h2>PO boxes and APO/FPO</h2>
<p>Most products can ship to PO boxes and APO/FPO addresses, subject to carrier limitations and product size. If a product is restricted to street addresses, that will be noted at checkout.</p>

<h2>Questions</h2>
<p>Email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>. We respond within 1&ndash;2 business days.</p>
`.trim();

  return {
    type: "SHIPPING_POLICY",
    title: "Shipping Policy",
    body,
    filename: "shipping.html"
  };
}

// ── Contact Information ───────────────────────────────────────────────────

export function generateContactInformation(config: BrandPolicyConfig): GeneratedPolicy {
  const body = `
${notice(config)}
<p><em>Last updated ${lastUpdated()}</em></p>

<p>Need to reach us? Here&rsquo;s how.</p>

<h2>Customer support</h2>
<p>Email: <a href="mailto:${config.supportEmail}">${config.supportEmail}</a></p>
<p>We respond Monday through Friday, generally within 1&ndash;2 business days. Messages received on weekends or U.S. holidays will be answered the next business day.</p>

<h2>Business information</h2>
<p>${config.legalEntity}</p>
<p>${config.governingState}, ${config.governingCountry}</p>
${config.mailingAddress ? `<p>${config.mailingAddress}</p>` : ""}

<h2>Press, partnerships, wholesale</h2>
<p>For partnership, press, or wholesale inquiries, please email <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> with a clear subject line describing the request.</p>
`.trim();

  return {
    type: "CONTACT_INFORMATION",
    title: "Contact Information",
    body,
    filename: "contact.html"
  };
}

// ── Aggregate ─────────────────────────────────────────────────────────────

export function generateAllPolicies(config: BrandPolicyConfig): GeneratedPolicy[] {
  return [
    generatePrivacyPolicy(config),
    generateTermsOfService(config),
    generateRefundPolicy(config),
    generateShippingPolicy(config),
    generateContactInformation(config)
  ];
}
