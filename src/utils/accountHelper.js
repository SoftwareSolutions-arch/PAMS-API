// utils/accountHelper.js
import Account from "../models/Account.js";

export const checkAndUpdateAccountStatus = async (account) => {
    if (!account) return;

    const today = new Date();
    if (account.status === "Active" && today >= account.maturityDate) {
        account.status = "Matured";
        await account.save();
    }
};
