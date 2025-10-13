// controllers/schemeController.js

import Scheme from "../models/Scheme.js";

/**
 * ✅ Create one or multiple schemes
 */
export const createScheme = async (req, res, next) => {
  try {
    const body = req.body;
    const companyId = req.user?.companyId || null;

    // Handle single or multiple input
    const schemes = Array.isArray(body) ? body : [body];

    // Validate all before insertion
    for (const s of schemes) {
      if (!s.name || !s.tenure || !s.minTerm || !s.maxTerm) {
        return res.status(400).json({
          message: "Each scheme must have name, tenure, minTerm, and maxTerm",
        });
      }
      if (s.maxTerm < s.minTerm) {
        return res.status(400).json({
          message: `In scheme "${s.name}", maximum term must be >= minimum term`,
        });
      }
    }

    // Create all at once
    const createdSchemes = await Scheme.insertMany(
      schemes.map((s) => ({
        ...s,
        companyId,
      }))
    );

    res.status(201).json({
      message:
        createdSchemes.length === 1
          ? "Scheme created successfully"
          : `${createdSchemes.length} schemes created successfully`,
      data: createdSchemes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Get all active schemes
 */
export const getSchemes = async (req, res, next) => {
  try {
    const { includeInactive, name } = req.query;
    const companyId = req.user?.companyId || null;

    const filter = {};
    if (companyId) filter.companyId = companyId;
    if (name) filter.name = { $regex: name, $options: "i" };
    if (!includeInactive) filter.isActive = true;

    const schemes = await Scheme.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Schemes fetched successfully",
      count: schemes.length,
      data: schemes,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Get single scheme by ID
 */
export const getSchemeById = async (req, res, next) => {
  try {
    const scheme = await Scheme.findById(req.params.id);

    if (!scheme || !scheme.isActive) {
      return res.status(404).json({ message: "Scheme not found or inactive" });
    }

    res.status(200).json({
      message: "Scheme fetched successfully",
      data: scheme,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Update a scheme by ID
 */
export const updateScheme = async (req, res, next) => {
  try {
    const { name, tenure, minTerm, maxTerm } = req.body;

    const scheme = await Scheme.findById(req.params.id);
    if (!scheme || !scheme.isActive) {
      return res.status(404).json({ message: "Scheme not found or inactive" });
    }

    scheme.name = name ?? scheme.name;
    scheme.tenure = tenure ?? scheme.tenure;
    scheme.minTerm = minTerm ?? scheme.minTerm;
    scheme.maxTerm = maxTerm ?? scheme.maxTerm;

    await scheme.save();

    res.status(200).json({
      message: "Scheme updated successfully",
      data: scheme,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Soft delete a scheme (mark as inactive)
 */
export const deleteScheme = async (req, res, next) => {
  try {
    const scheme = await Scheme.findById(req.params.id);
    if (!scheme || !scheme.isActive) {
      return res.status(404).json({ message: "Scheme not found or already inactive" });
    }

    await scheme.softDelete();

    res.status(200).json({
      message: "Scheme deactivated successfully (soft deleted)",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Restore a soft-deleted scheme
 */
export const restoreScheme = async (req, res, next) => {
  try {
    const scheme = await Scheme.findById(req.params.id);
    if (!scheme) {
      return res.status(404).json({ message: "Scheme not found" });
    }

    if (scheme.isActive) {
      return res.status(400).json({ message: "Scheme is already active" });
    }

    await scheme.restore();

    res.status(200).json({
      message: "Scheme restored successfully",
      data: scheme,
    });
  } catch (error) {
    next(error);
  }
};
