import { ilike } from "drizzle-orm";
import { db } from "../database/connection.js";
import { sales } from "../schemas/index.js";

export const findSaleByBillId = async (billId) => {
  const [sale] = await db
    .select()
    .from(sales)
    .where(ilike(sales.bill_id, billId))
    .limit(1);

  return sale ? sale : null;
};
