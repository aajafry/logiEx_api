import { ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "../database/connection.js";
import {
  insertPurchaseSchema,
  insertPurchaseProductSchema,
  inventoryProducts,
  purchases,
  purchaseProducts,
  updatePurchaseSchema,
} from "../schemas/index.js";
import {
  calculatePurchasePrice,
  findInventoryByName,
  findProductByName,
  findPurchaseByMrId,
  findVendorByName,
} from "../services/index.js";

export const purchasesController = {
  create: async (req, res) => {
    try {
      const { mr_id, vendor, inventory, products } = req.body;

      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: "Products are required" });
      }

      await insertPurchaseSchema.parseAsync({
        mr_id,
        vendor,
        inventory,
      });

      const existingPurchase = await findPurchaseByMrId(mr_id);
      if (existingPurchase) {
        return res.status(409).json({
          message: `The purchase with the MR ID "${mr_id}" already exists. Please choose a different MR ID.`,
        });
      }

      const vendorValidation = await findVendorByName(vendor);
      if (!vendorValidation) {
        return res.status(404).json({
          message: `The vendor "${vendor}" was not found. Please verify the vendor.`,
        });
      }

      const inventoryValidation = await findInventoryByName(inventory);
      if (!inventoryValidation) {
        return res.status(404).json({
          message: `The inventory "${inventory}" was not found. Please verify the inventory.`,
        });
      }

      const productErrors = [];
      await Promise.all(
        products.map(async (product) => {
          await insertPurchaseProductSchema.parseAsync(product);

          const productVerification = await findProductByName(product.product);
          if (!productVerification) {
            productErrors.push(
              `The product ${product.product} was not found. Please verify the product`
            );
            return null;
          }
          return product;
        })
      );
      if (productErrors.length > 0) {
        return res.status(404).json({ message: productErrors });
      }

      const allPurchaseProducts = [];
      const newPurchase = await db.transaction(async (tx) => {
        await tx
          .insert(purchases)
          .values({
            mr_id,
            vendor,
            inventory,
          })
          .returning();

        for (const product of products) {
          const {
            product: productName,
            quantity,
            unit_price,
            discount,
          } = product;

          const parseDiscount = parseFloat(discount) || 0;

          const productTotalPrice =
            quantity * unit_price -
            (quantity * unit_price * parseDiscount) / 100;

          const [purchaseProduct] = await tx
            .insert(purchaseProducts)
            .values({
              mr_id,
              product: productName,
              quantity,
              unit_price,
              discount: parseDiscount,
              total_price: productTotalPrice,
            })
            .returning();
          allPurchaseProducts.push(purchaseProduct);

          await tx
            .insert(inventoryProducts)
            .values({
              mr_id,
              inventory,
              product: productName,
              quantity,
            })
            .returning();
        }

        const updatedTotalPrice = allPurchaseProducts.reduce(
          (total, product) => total + parseFloat(product.total_price),
          0
        );

        const [updatedpurchase] = await tx
          .update(purchases)
          .set({
            total_price: updatedTotalPrice,
            updated_at: new Date(),
          })
          .where(ilike(purchases.mr_id, mr_id))
          .returning();

        return updatedpurchase;
      });

      res.status(201).json({
        message: `The purchase MR ID "${mr_id}" has been created successfully`,
        purchase: newPurchase,
        products: allPurchaseProducts,
      });
    } catch (error) {
      console.error("An error occurred while creating purchase", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while creating the purchase. Please try again.",
        error: error.message,
      });
    }
  },
  retrieveAll: async (req, res) => {
    try {
      const allPurchases = await db.query.purchases.findMany({
        with: {
          vendor: false,
          inventory: false,
          products: {
            columns: {
              id: false,
              mr_id: false,
            },
          },
          storages: {
            columns: {
              id: false,
              mr_id: false,
            },
          },
          sales: {
            columns: {
              id: false,
              mr_id: false,
            },
          },
        },
      });
      res.status(200).json({
        message: "Purchases retrieved successfully",
        purchases: allPurchases,
      });
    } catch (error) {
      console.error("An error occurred while retrieving purchases", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while retrieving purchases. Please try again.",
        error: error.message,
      });
    }
  },
  retrieveByMrId: async (req, res) => {
    try {
      const { mrId } = req.params;
      const purchase = await db.query.purchases.findFirst({
        where: ilike(purchases.mr_id, mrId),
        with: {
          vendor: false,
          inventory: false,
          products: {
            columns: {
              id: false,
              mr_id: false,
            },
          },
          storages: {
            columns: {
              id: false,
              mr_id: false,
            },
          },
          sales: {
            columns: {
              id: false,
              mr_id: false,
            },
          },
        },
      });
      if (!purchase) {
        return res.status(404).json({
          message: `The purchase MR ID "${mrId}" was not found. Please verify the MR ID and try again.`,
        });
      }

      res.status(200).json({
        message: "Purchase retrieved successfully",
        purchase,
      });
    } catch (error) {
      console.error("An error occurred while retrieving purchase", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while retrieving the purchase. Please try again.",
        error: error.message,
      });
    }
  },
  updateByMrId: async (req, res) => {
    try {
      const { mrId } = req.params;
      await updatePurchaseSchema.parseAsync(req.body);
      const { mr_id, vendor, inventory, adjustment } = req.body;
      const parseAdjustment = parseFloat(adjustment);

      const existingPurchase = await findPurchaseByMrId(mrId);
      if (!existingPurchase) {
        return res.status(404).json({
          message: `The purchase MR ID "${mrId}" was not found. Please verify the MR ID.`,
        });
      }

      const {
        mr_id: existingPurchaseMRId,
        vendor: existingPurchaseVendor,
        inventory: existingPurchaseInventory,
        adjustment: existingPurchaseAdjustment,
        total_price: existingPurchaseTotalPrice,
      } = existingPurchase;

      if (mr_id && mr_id !== existingPurchaseMRId) {
        const MrIdVerification = await findPurchaseByMrId(mr_id);
        if (MrIdVerification) {
          return res.status(409).json({
            message: `The purchase with the MR ID "${mr_id}" already exists. Please choose a different MR ID.`,
          });
        }
      }

      if (vendor && vendor !== existingPurchaseVendor) {
        const vendorValidation = await findVendorByName(vendor);
        if (!vendorValidation) {
          return res.status(404).json({
            message: `The vendor "${vendor}" was not found. Please verify the vendor.`,
          });
        }
      }

      if (inventory && inventory !== existingPurchaseInventory) {
        const inventoryValidation = await findInventoryByName(inventory);
        if (!inventoryValidation) {
          return res.status(404).json({
            message: `The inventory "${inventory}" was not found. Please verify the inventory.`,
          });
        }
      }

      // calculate current MR ID, not changeble MR ID
      const availableTotalPrice = await calculatePurchasePrice(mrId);

      if (
        parseAdjustment &&
        (parseAdjustment < 0 || parseAdjustment > availableTotalPrice)
      ) {
        return res.status(400).json({
          message:
            "Adjustment amount must be between 0 and available total price.",
        });
      }

      const setAdjustment = parseAdjustment
        ? parseAdjustment
        : parseFloat(existingPurchaseAdjustment);

      const setTotalPrice = availableTotalPrice - setAdjustment;

      const updatedData = {
        mr_id: mr_id || existingPurchaseMRId,
        vendor: vendor || existingPurchaseVendor,
        inventory: inventory || existingPurchaseInventory,
        total_price: setTotalPrice,
        adjustment: setAdjustment,
        updated_at: new Date(),
      };

      const [updatedPurchase] = await db
        .update(purchases)
        .set(updatedData)
        .where(ilike(purchases.mr_id, mrId))
        .returning();

      if (!updatedPurchase) {
        return res.status(404).json({
          message: `An error occurred while updating the purchase MR ID "${mrId}". Please try again.`,
        });
      }

      await db
        .update(inventoryProducts)
        .set({
          inventory: updatedPurchase.inventory,
          updated_at: new Date(),
        })
        .where(ilike(inventoryProducts.mr_id, mrId))
        .returning();

      res.status(200).json({
        message: `The purchase MR ID "${mrId}" has been updated successfully`,
        purchase: updatedPurchase,
      });
    } catch (error) {
      console.error("An error occurred while updating purchase", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors.map((e) => e.message),
        });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while updating the purchase. Please try again.",
        error: error.message,
      });
    }
  },
  deleteByMrId: async (req, res) => {
    try {
      const { mrId } = req.params;

      const [deletedPurchase] = await db
        .delete(purchases)
        .where(ilike(purchases.mr_id, mrId))
        .returning();

      if (!deletedPurchase) {
        return res.status(404).json({
          message: `The purchase MR ID "${mrId}" was not found. Please verify the MR ID.`,
        });
      }

      res.status(200).json({
        message: `The purchase MR ID "${mrId}" has been deleted successfully`,
      });
    } catch (error) {
      console.error(
        "An error occurred while deleting purchase by MR Id",
        error
      );
      res.status(500).json({
        message:
          "An unexpected error occurred while deleting the purchase. Please try again.",
        error: error.message,
      });
    }
  },
};
