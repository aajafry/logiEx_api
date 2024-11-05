import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { inventoryEmployments } from "../index.js";

export const insertInventoryEmploymentSchema = createInsertSchema(
  inventoryEmployments,
  {
    employee_id: z
      .string({
        required_error: "Employee ID is required",
      })
      .uuid({ message: "Invalid employee ID" }),
    inventory: z
      .string({
        required_error: "Inventory name is required",
      })
      .max(80, { message: "Inventory name must not exceed 80 characters" })
      .nonempty({ message: "Inventory name is required" }),
  }
);

export const updateInventoryEmploymentSchema = createInsertSchema(
  inventoryEmployments,
  {
    termination_date: z
      .string()
      .datetime({ message: "Invalid datetime" })
      .optional(),
    resign_date: z
      .string()
      .datetime({ message: "Invalid datetime" })
      .optional(),
    transfer_date: z
      .string()
      .datetime({ message: "Invalid datetime" })
      .optional(),
  }
);
