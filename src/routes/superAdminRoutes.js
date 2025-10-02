import express from "express";
import { signupSuperAdmin, loginSuperAdmin } from "../controllers/superAdminController.js";
import { protectSuperAdmin } from "../middleware/superAdminMiddleWare.js";

const router = express.Router();

router.post("/signup", signupSuperAdmin);
router.post("/login", loginSuperAdmin);

export default router;
