import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { SuperAdmin } from "../models/SuperAdmin.js";

// SuperAdmin Signup
export const signupSuperAdmin = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // check existing
    const existing = await SuperAdmin.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "SuperAdmin already exists" });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const superAdmin = new SuperAdmin({
      fullName,
      email,
      password: hashedPassword
    });

    await superAdmin.save();

    res.status(201).json({
      message: "SuperAdmin registered successfully",
      superAdmin: {
        id: superAdmin._id,
        fullName: superAdmin.fullName,
        email: superAdmin.email,
        role: superAdmin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SuperAdmin Login
export const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // find user
    const superAdmin = await SuperAdmin.findOne({ email });
    if (!superAdmin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // check password
    const isMatch = await bcrypt.compare(password, superAdmin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // sign JWT
    const token = jwt.sign(
      { id: superAdmin._id, role: superAdmin.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      superAdmin: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
