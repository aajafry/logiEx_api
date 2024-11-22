import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { transferProducts } from "../index.js";

export const insertTransferProductSchema = createInsertSchema(
  transferProducts,
  {
    mr_id: z
      .string({
        required_error: "MR ID is required",
      })
      .min(6, { message: "MR ID be at least 6 characters long" })
      .max(20, { message: "MR ID must not exceed 20 characters" }),
    product: z
      .string({
        required_error: "Product name is required",
      })
      .max(80, { message: "Product name must not exceed 80 characters" })
      .nonempty({ message: "Product name is required" }),
    quantity: z
      .number({
        required_error: "Product quantity is required",
        invalid_type_error: "Product quantity must be a Number",
      })
      .positive({ message: "Product quantity must be a positive number" })
      .int({ message: "Product quantity must be an integer" }),
  }
).pick({
  trf_id: false,
  mr_id: true,
  product: true,
  quantity: true,
});

export const updateTransferProductSchema = createInsertSchema(
  transferProducts,
  {
    quantity: z
      .number()
      .positive({ message: "Product quantity must be a positive number" })
      .int({ message: "Product quantity must be an integer" })
      .optional(),
  }
).pick({
  trf_id: false,
  product: false,
  mr_id: false,
});