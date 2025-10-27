import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { SuperAdmin } from "../models/SuperAdmin.js";

const USER_EXPIRES_IN = "4h";
const SUPERADMIN_EXPIRES_IN = "1d";

function signToken(payload, expiresIn = USER_EXPIRES_IN) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

export async function rotateUserSessionAndSign(userIdOrDoc) {
  const userId = typeof userIdOrDoc === "string" ? userIdOrDoc : userIdOrDoc._id;
  const updated = await User.findByIdAndUpdate(userId, { $inc: { sessionVersion: 1 } }, { new: true });

  if (!updated) {
    throw new Error("User not found for token issuance");
  }

  const payload = {
    id: updated._id.toString(),
    companyId: updated.companyId?.toString(),
    role: updated.role,
    sv: updated.sessionVersion,
  };

  const token = signToken(payload, USER_EXPIRES_IN);
  return { token, sessionVersion: updated.sessionVersion };
}

export async function invalidateUserSessions(userIdOrDoc) {
  const userId = typeof userIdOrDoc === "string" ? userIdOrDoc : userIdOrDoc._id;
  const updated = await User.findByIdAndUpdate(userId, { $inc: { sessionVersion: 1 } }, { new: true });
  if (!updated) {
    throw new Error("User not found for session invalidation");
  }
  return updated.sessionVersion;
}

export async function rotateSuperAdminSessionAndSign(superAdminIdOrDoc) {
  const id = typeof superAdminIdOrDoc === "string" ? superAdminIdOrDoc : superAdminIdOrDoc._id;
  const updated = await SuperAdmin.findByIdAndUpdate(id, { $inc: { sessionVersion: 1 } }, { new: true });

  if (!updated) {
    throw new Error("SuperAdmin not found for token issuance");
  }

  const payload = {
    id: updated._id.toString(),
    role: updated.role,
    sv: updated.sessionVersion,
  };

  const token = signToken(payload, SUPERADMIN_EXPIRES_IN);
  return { token, sessionVersion: updated.sessionVersion };
}

export async function invalidateSuperAdminSessions(idOrDoc) {
  const id = typeof idOrDoc === "string" ? idOrDoc : idOrDoc._id;
  const updated = await SuperAdmin.findByIdAndUpdate(id, { $inc: { sessionVersion: 1 } }, { new: true });
  if (!updated) {
    throw new Error("SuperAdmin not found for session invalidation");
  }
  return updated.sessionVersion;
}
