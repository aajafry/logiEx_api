import express from "express";
import { customersController } from "../controllers/index.js";
import { authGuard } from "../middlewares/authGuard.js";

const customersRouter = express.Router();

customersRouter.post(
  "/",
  authGuard(["admin", "inventory-manager", "inventory-in-charge"]),
  customersController.create
);
customersRouter.get(
  "/",
  authGuard(["admin", "inventory-manager", "inventory-in-charge", "guest"]),
  customersController.retrieveAll
);
customersRouter.get(
  "/:id",
  authGuard(["admin", "inventory-manager", "inventory-in-charge", "guest"]),
  customersController.retrieveById
);
customersRouter.put(
  "/:id",
  authGuard(["admin", "inventory-manager", "inventory-in-charge"]),
  customersController.updateById
);
customersRouter.delete(
  "/:id",
  authGuard(["admin"]),
  customersController.deleteById
);

export { customersRouter };
