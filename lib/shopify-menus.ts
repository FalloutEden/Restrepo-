import "server-only";

import { resolveShopifyCredentials, type ShopifyCredentials } from "@/lib/shopify-credentials";
import type { TenantContext } from "@/lib/tenant-context";

// Manage Shopify storefront navigation menus via the Admin GraphQL API.
// Requires the `read_online_store_navigation` and `write_online_store_navigation`
// access scopes (added 2026-05-06 to Black Vault Auto). Falls back to a
// "scope missing" error if the install hasn't been re-authed.

type MenuItem = {
  title: string;
  type: string; // FRONTPAGE, COLLECTION, COLLECTIONS, CATALOG, PRODUCT, PAGE, BLOG, ARTICLE, HTTP, SHOP_POLICY, SEARCH, CUSTOMER_ACCOUNT_PAGE
  url?: string | null;
  resourceId?: string | null;
};

type MenuItemWithId = MenuItem & { id?: string };

export type MenuSummary = {
  id: string;
  handle: string;
  title: string;
  items: MenuItemWithId[];
};

async function shopifyGraphQL<T>(
  creds: ShopifyCredentials,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const r = await fetch(`https://${creds.storeDomain}/admin/api/${creds.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": creds.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const text = await r.text();
  const parsed: { data?: T; errors?: unknown } = text ? JSON.parse(text) : {};
  if (!r.ok || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
    throw new Error(`Shopify GraphQL ${r.status}: ${text}`);
  }
  return parsed.data as T;
}

async function fetchMenus(creds: ShopifyCredentials): Promise<MenuSummary[]> {
  const data = await shopifyGraphQL<{
    menus: { edges: Array<{ node: { id: string; handle: string; title: string; items: MenuItemWithId[] } }> };
  }>(
    creds,
    `query { menus(first: 25) {
      edges { node { id handle title items { id title type url resourceId } } }
    } }`
  );
  return data.menus.edges.map((e) => e.node);
}

export async function listMenus(brand?: string, tenantCtx?: TenantContext): Promise<MenuSummary[]> {
  return fetchMenus(resolveShopifyCredentials(brand, tenantCtx));
}

async function getMenuByHandle(creds: ShopifyCredentials, handle: string): Promise<MenuSummary | null> {
  // Shopify's `menu(handle:)` query is unreliable across API versions — use
  // the list-and-filter approach instead. Reuse the already-resolved creds so
  // a tenant call doesn't fall back to the founder env path.
  const all = await fetchMenus(creds);
  return all.find((m) => m.handle === handle) ?? null;
}

export type AddMenuItemInput = {
  brand?: string;
  menuHandle: string; // typically "main-menu" or "footer"
  title: string;
  // Either provide a resource (page/product/collection/article/blog) or a raw url.
  page?: { id: number };       // Shopify page numeric id
  product?: { id: number };
  collection?: { id: number };
  article?: { id: number };
  blog?: { id: number };
  url?: string;
  // Insert at this index (0 = first). Default = end.
  position?: number;
};

export async function addMenuItem(input: AddMenuItemInput, tenantCtx?: TenantContext): Promise<MenuSummary> {
  const creds = resolveShopifyCredentials(input.brand, tenantCtx);
  const menu = await getMenuByHandle(creds, input.menuHandle);
  if (!menu) throw new Error(`Menu with handle "${input.menuHandle}" not found`);

  // Already there? Skip.
  if (menu.items.some((i) => i.title.trim().toLowerCase() === input.title.trim().toLowerCase())) {
    return menu;
  }

  let newItem: MenuItem;
  if (input.page) {
    newItem = { title: input.title, type: "PAGE", resourceId: `gid://shopify/OnlineStorePage/${input.page.id}` };
  } else if (input.product) {
    newItem = { title: input.title, type: "PRODUCT", resourceId: `gid://shopify/Product/${input.product.id}` };
  } else if (input.collection) {
    newItem = { title: input.title, type: "COLLECTION", resourceId: `gid://shopify/Collection/${input.collection.id}` };
  } else if (input.article) {
    newItem = { title: input.title, type: "ARTICLE", resourceId: `gid://shopify/OnlineStoreArticle/${input.article.id}` };
  } else if (input.blog) {
    newItem = { title: input.title, type: "BLOG", resourceId: `gid://shopify/OnlineStoreBlog/${input.blog.id}` };
  } else if (input.url) {
    newItem = { title: input.title, type: "HTTP", url: input.url };
  } else {
    throw new Error("addMenuItem requires one of: page, product, collection, article, blog, url");
  }

  const existing = menu.items.map((i) => {
    const o: MenuItem = { title: i.title, type: i.type };
    if (i.url) o.url = i.url;
    if (i.resourceId) o.resourceId = i.resourceId;
    return o;
  });

  const items = [...existing];
  const pos = typeof input.position === "number" ? input.position : items.length;
  items.splice(Math.max(0, Math.min(pos, items.length)), 0, newItem);

  const upd = await shopifyGraphQL<{
    menuUpdate: { menu: { id: string; items: MenuItemWithId[] } | null; userErrors: Array<{ message: string }> };
  }>(
    creds,
    `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu { id title handle items { id title type url resourceId } }
        userErrors { field message }
      }
    }`,
    { id: menu.id, title: menu.title, handle: menu.handle, items }
  );
  const err = upd.menuUpdate.userErrors[0];
  if (err) throw new Error(`menuUpdate failed: ${err.message}`);
  if (!upd.menuUpdate.menu) throw new Error("menuUpdate returned null menu");

  return {
    id: upd.menuUpdate.menu.id,
    handle: input.menuHandle,
    title: menu.title,
    items: upd.menuUpdate.menu.items
  };
}

export async function removeMenuItem(brand: string | undefined, menuHandle: string, title: string, tenantCtx?: TenantContext): Promise<MenuSummary> {
  const creds = resolveShopifyCredentials(brand, tenantCtx);
  const menu = await getMenuByHandle(creds, menuHandle);
  if (!menu) throw new Error(`Menu with handle "${menuHandle}" not found`);
  const items = menu.items
    .filter((i) => i.title.trim().toLowerCase() !== title.trim().toLowerCase())
    .map((i) => {
      const o: MenuItem = { title: i.title, type: i.type };
      if (i.url) o.url = i.url;
      if (i.resourceId) o.resourceId = i.resourceId;
      return o;
    });
  const upd = await shopifyGraphQL<{
    menuUpdate: { menu: { id: string; items: MenuItemWithId[] } | null; userErrors: Array<{ message: string }> };
  }>(
    creds,
    `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu { id items { id title type url resourceId } }
        userErrors { message }
      }
    }`,
    { id: menu.id, title: menu.title, handle: menu.handle, items }
  );
  const err = upd.menuUpdate.userErrors[0];
  if (err) throw new Error(`menuUpdate failed: ${err.message}`);
  if (!upd.menuUpdate.menu) throw new Error("menuUpdate returned null menu");
  return {
    id: upd.menuUpdate.menu.id,
    handle: menuHandle,
    title: menu.title,
    items: upd.menuUpdate.menu.items
  };
}
