import { PrismaClient } from './generated/prisma/index.js';

// One shared client, constructed at import exactly as before.
let client = new PrismaClient();

/**
 * Test-only seam. Route modules import the `prisma` binding below, so a test can point
 * every route at an in-memory double and drive the real handlers without a live
 * database. Production never calls this; the client above is what serves requests.
 */
export function setPrismaClientForTests(next) {
  client = next;
}

export const prisma = new Proxy(
  {},
  {
    get: (_target, property) => {
      const value = Reflect.get(client, property);
      // Methods such as $transaction rely on private class fields, so they must stay
      // bound to the real client rather than being invoked with the proxy as `this`.
      return typeof value === 'function' ? value.bind(client) : value;
    },
    has: (_target, property) => Reflect.has(client, property),
  }
);
