import { and, eq, gte, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../database/connection.js";
import {
  insertSaleSchema,
  insertSaleProductSchema,
  inventoryProducts,
  sales,
  saleProducts,
  updateSaleSchema,
} from "../schemas/index.js";
import {
  calculateSalePrice,
  findCustomerById,
  findInventoryByName,
  findSaleByBillId,
} from "../services/index.js";

export const salesController = {
  create: async (req, res) => {
    try {
      const {
        bill_id,
        customer_id,
        inventory,
        shipping_address,
        status,
        products,
      } = req.body;

      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: "Products are required" });
      }

      await insertSaleSchema.parseAsync({
        bill_id,
        customer_id,
        shipping_address,
        status,
        inventory,
      });

      const existingSale = await findSaleByBillId(bill_id);
      if (existingSale) {
        return res.status(409).json({
          message: `The sale with the BILL ID "${bill_id}" already exists. Please choose a different BILL ID.`,
        });
      }

      const customerValidation = await findCustomerById(customer_id);
      if (!customerValidation) {
        return res.status(404).json({
          message: `The customer with ID ${customer_id} was not found. Please verify the customer ID`,
        });
      }

      const inventoryValidation = await findInventoryByName(inventory);
      if (!inventoryValidation) {
        return res.status(404).json({
          message: `The inventory "${inventory}" was not found. Please verify the inventory.`,
        });
      }

      const allSaleProducts = [];
      const newSale = await db.transaction(async (tx) => {
        await tx
          .insert(sales)
          .values({
            bill_id,
            customer_id,
            shipping_address,
            status,
          })
          .returning();

        for (const product of products) {
          await insertSaleProductSchema.parseAsync(product);
          const {
            product: productName,
            quantity,
            unit_price,
            discount,
          } = product;

          const [productQuery] = await tx
            .select()
            .from(inventoryProducts)
            .where(
              and(
                ilike(inventoryProducts.inventory, inventory),
                ilike(inventoryProducts.product, productName),
                gte(inventoryProducts.quantity, quantity)
              )
            )
            .limit(1);

          if (!productQuery) {
            throw new Error(
              `Product "${productName}" (${quantity} units) not found at inventory "${inventory}". Please check the inventory product and try again.`
            );
            tx.rollback();
          }

          const parseDiscount = parseFloat(discount) || 0;

          const productTotalPrice =
            quantity * unit_price -
            (quantity * unit_price * parseDiscount) / 100;

          const [newProduct] = await tx
            .insert(saleProducts)
            .values({
              mr_id: productQuery.mr_id,
              inventory,
              bill_id,
              product: productName,
              quantity,
              unit_price,
              discount: parseDiscount,
              total_price: productTotalPrice,
            })
            .returning();
          allSaleProducts.push(newProduct);

          await tx
            .update(inventoryProducts)
            .set({
              quantity: sql`${inventoryProducts.quantity} - ${quantity}`,
              updated_at: new Date(),
            })
            .where(eq(inventoryProducts.id, productQuery.id))
            .returning();
        }

        const updatedTotalPrice = allSaleProducts.reduce(
          (total, product) => total + parseFloat(product.total_price),
          0
        );

        const [updatedSale] = await tx
          .update(sales)
          .set({
            total_amount: updatedTotalPrice,
            updated_at: new Date(),
          })
          .where(ilike(sales.bill_id, bill_id))
          .returning();

        return updatedSale;
      });

      res.status(201).json({
        message: `The sales BILL ID "${bill_id}" has been created successfully`,
        sale: newSale,
        products: allSaleProducts,
      });
    } catch (error) {
      console.error("Error creating sale Bill ID:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while creating the sale. Please try again.",
        error: error.message,
      });
    }
  },
  retrieveAll: async (req, res) => {
    try {
      const allSales = await db.query.sales.findMany({
        columns: {
          customer_id: false,
        },
        with: {
          customer: {
            columns: {
              id: false,
            },
          },
          products: {
            columns: {
              id: false,
              bill_id: false,
            },
          },
          shipments: {
            columns: {
              id: false,
              bill_id: false,
            },
          },
        },
      });

      res.status(200).json({
        message: "Sales retrieved successfully.",
        sales: allSales,
      });
    } catch (error) {
      console.error("Error retrieving sales:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while retrieving sales. Please try again.",
        error: error.message,
      });
    }
  },
  retrieveByBillId: async (req, res) => {
    try {
      const { billId } = req.params;
      const sale = await db.query.sales.findFirst({
        where: ilike(sales.bill_id, billId),
        columns: {
          customer_id: false,
        },
        with: {
          customer: {
            columns: {
              id: false,
            },
          },
          products: {
            columns: {
              id: false,
              bill_id: false,
            },
          },
          shipments: {
            columns: {
              id: false,
              bill_id: false,
            },
          },
        },
      });

      if (!sale) {
        return res.status(404).json({
          message: `The sale BILL ID "${billId}" was not found. Please verify the BILL ID and try again.`,
        });
      }

      res.status(200).json({
        message: "Sale retrieved successfully.",
        sale,
      });
    } catch (error) {
      console.error("Error retrieving sale", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while retrieving the sale. Please try again.",
        error: error.message,
      });
    }
  },
  updateByBillId: async (req, res) => {
    try {
      await updateSaleSchema.parseAsync(req.body);
      const { billId } = req.params;
      const { bill_id, customer_id, shipping_address, adjustment, status } =
        req.body;

      const parseAdjustment = parseFloat(adjustment);

      const existingSale = await findSaleByBillId(billId);
      if (!existingSale) {
        return res.status(404).json({
          message: `The sale BILL ID "${billId}" was not found. Please verify the BILL ID.`,
        });
      }

      const {
        bill_id: existingSaleBillId,
        customer_id: existingSaleCustomerId,
        shipping_address: existingSaleShippingAddress,
        adjustment: existingSaleAdjustment,
        status: existingSaleStatus,
      } = existingSale;

      if (bill_id && bill_id !== existingSaleBillId) {
        const billIdVerification = await findSaleByBillId(bill_id);
        if (billIdVerification) {
          return res.status(409).json({
            message: `The sale with the BILL ID "${bill_id}" already exists. Please choose a different BILL ID.`,
          });
        }
      }

      if (customer_id && customer_id !== existingSaleCustomerId) {
        const customerValidation = await findCustomerById(customer_id);
        if (!customerValidation) {
          return res.status(404).json({
            message: `The customer ID "${customer_id}" was not found. Please verify the customer ID.`,
          });
        }
      }
      // calculate current BILL ID, not changeble BILL ID
      const availableTotalPrice = await calculateSalePrice(billId);

      if (
        parseAdjustment &&
        (parseAdjustment < 0 || parseAdjustment > availableTotalPrice)
      ) {
        return res.status(400).json({
          message: "Invalid adjustment amount. please try again.",
        });
      }

      const setAdjustment = parseAdjustment
        ? parseAdjustment
        : parseFloat(existingSaleAdjustment);

      const setTotalPrice = availableTotalPrice - setAdjustment;

      const updatedData = {
        bill_id: bill_id || existingSaleBillId,
        customer_id: customer_id || existingSaleCustomerId,
        shipping_address: shipping_address || existingSaleShippingAddress,
        adjustment: setAdjustment,
        total_amount: setTotalPrice,
        status: status || existingSaleStatus,
        updated_at: new Date(),
      };

      const [updatedSale] = await db
        .update(sales)
        .set(updatedData)
        .where(ilike(sales.bill_id, billId))
        .returning();
      if (!updatedSale) {
        return res.status(404).json({
          message: `An error occurred while updating the sale BILL ID "${billId}". Please try again.`,
        });
      }

      res.status(200).json({
        message: `The sale BILL ID "${billId}" has been updated successfully`,
        sale: updatedSale,
      });
    } catch (error) {
      console.error("Error updating sale by bill ID:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while updating the sale. Please try again.",
        error: error.message,
      });
    }
  },
  deleteByBillId: async (req, res) => {
    try {
      const { billId } = req.params;
      // TODO: reset inventory product through sales product and then delete the sales.

      const [deletedSale] = await db
        .delete(sales)
        .where(ilike(sales.bill_id, billId))
        .returning();

      if (!deletedSale) {
        return res.status(404).json({
          message: `The sale BILL ID "${billId}" was not found. Please verify the BILL ID.`,
        });
      }

      res.status(200).json({
        message: `The sale BILL ID "${billId}" has been deleted successfully`,
      });
    } catch (error) {
      console.error("Error deleting sale by bill ID:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while deleting the sale. Please try again.",
        error: error.message,
      });
    }
  },
};
