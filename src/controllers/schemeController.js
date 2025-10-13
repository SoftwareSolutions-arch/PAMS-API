// controllers/schemeController.js

import Scheme from "../models/Scheme.js";

/**
 * ✅ Create one or multiple schemes
 */
// controllers/schemeController.js
export const createScheme = async (req, res, next) => {
  try {
    const body = req.body;
    const companyId = req.user?.companyId || null;

    // Handle single or multiple input
    const schemes = Array.isArray(body) ? body : [body];

    // 🧾 Basic validation
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

    // Normalize scheme names (case-insensitive handling)
    const normalizedNames = [...new Set(schemes.map((s) => s.name.trim().toLowerCase()))];

    // Fetch existing schemes (active + inactive)
    const existingSchemes = await Scheme.find({
      companyId,
      name: { $in: normalizedNames.map((n) => new RegExp(`^${n}$`, "i")) },
    });

    const existingNames = existingSchemes.map((s) => s.name.toLowerCase());
    const restored = new Set();
    const skipped = new Set();

    // ♻️ Restore inactive ones or skip active ones
    for (const existing of existingSchemes) {
      const match = schemes.find(
        (s) => s.name.trim().toLowerCase() === existing.name.toLowerCase()
      );

      if (existing.isActive) {
        skipped.add(existing.name);
        continue;
      }

      // Restore and update
      existing.isActive = true;
      existing.tenure = match.tenure;
      existing.minTerm = match.minTerm;
      existing.maxTerm = match.maxTerm;
      await existing.save();
      restored.add(existing.name);
    }

    // 🆕 Create only brand-new unique ones
    const newSchemes = [];
    const seenNames = new Set(existingNames);

    for (const s of schemes) {
      const key = s.name.trim().toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      newSchemes.push(s);
    }

    let createdSchemes = [];
    if (newSchemes.length > 0) {
      createdSchemes = await Scheme.insertMany(
        newSchemes.map((s) => ({
          ...s,
          companyId,
        }))
      );
    }

    // 🧠 Build message
    const parts = [];
    if (createdSchemes.length > 0)
      parts.push(`${createdSchemes.length} new scheme(s) created`);
    if (restored.size > 0)
      parts.push(`restored scheme(s): ${[...restored].join(", ")}`);
    if (skipped.size > 0)
      parts.push(`skipped existing scheme(s): ${[...skipped].join(", ")}`);

    // ✅ Decide status code dynamically
    let statusCode = 201; // default: created
    if (createdSchemes.length === 0 && restored.size > 0 && skipped.size === 0)
      statusCode = 200; // only restored
    else if (createdSchemes.length === 0 && restored.size === 0 && skipped.size > 0)
      statusCode = 409; // conflict (all duplicates)
    else if (createdSchemes.length === 0 && restored.size > 0 && skipped.size > 0)
      statusCode = 207; // partial (some restored, some skipped)
    else if (createdSchemes.length > 0 && skipped.size > 0)
      statusCode = 207; // partial success (some created, some skipped)

    // ✅ Send final response
    res.status(statusCode).json({
      message: parts.join("; ") || "No new schemes created",
      created: createdSchemes,
      restored: [...restored],
      skipped: [...skipped],
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
