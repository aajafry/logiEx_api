import express from "express";
import { purchasesController } from "../controllers/index.js";
import { authGuard } from "../middlewares/authGuard.js";

const purchasesRouter = express.Router();

purchasesRouter.post(
  "/",
  authGuard(["admin", "procurement-manager"]),
  purchasesController.create
);
purchasesRouter.get(
  "/",
  authGuard([
    "admin",
    "procurement-manager",
    "inventory-manager",
    "inventory-in-charge",
    "guest",
  ]),
  purchasesController.retrieveAll
);
purchasesRouter.get(
  "/:mrId",
  authGuard([
    "admin",
    "procurement-manager",
    "inventory-manager",
    "inventory-in-charge",
    "guest",
  ]),
  purchasesController.retrieveByMrId
);
purchasesRouter.put(
  "/:mrId",
  authGuard(["admin", "procurement-manager"]),
  purchasesController.updateByMrId
);
purchasesRouter.delete(
  "/:mrId",
  authGuard(["admin"]),
  purchasesController.deleteByMrId
);

export { purchasesRouter };
