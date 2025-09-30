import { Router } from "express";
import {
    addCompany,
    getAllCompanies,
    getCompany,
    updateCompanyById,
    deleteCompany,
} from "../controllers/companyController.js";

const router = Router();

router.post("/", addCompany);
router.get("/", getAllCompanies);
router.get("/:id", getCompany);
router.put("/:id", updateCompanyById);
router.delete("/:id", deleteCompany);

export default router;
