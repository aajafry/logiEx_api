import { relations } from "drizzle-orm/relations";
import { sales, shipmentProducts, saleProducts, customers } from "../index.js";

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customer_id],
    references: [customers.id],
  }),
  products: many(saleProducts),
  shipments: many(shipmentProducts),
}));
