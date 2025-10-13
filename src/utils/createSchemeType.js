
// ======================================================
// 🔹 Helper: Generate scheme type based on name
// ======================================================
export const generateSchemeType = (name = "") => {
  if (!name) return "";

  const words = name.trim().split(/\s+/);

  // If only one word → first 2 letters
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }

  // For multiple words → take first letters (max 4)
  return words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase())
    .join("");
};

// ======================================================
// 🔹 Helper: Ensure unique scheme type per company
// ======================================================
export const ensureUniqueType = (type, existingTypes) => {
  let finalType = type;
  let counter = 1;

  while (existingTypes.includes(finalType)) {
    finalType = `${type}${counter}`;
    counter++;
  }

  existingTypes.push(finalType); // Reserve it
  return finalType;
};