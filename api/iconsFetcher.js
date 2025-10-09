import { appExpress, router } from "./initializeExpress.js";
import { bloomFilter } from "./bloomFilter.js";

// API endpoint to check username availability
router.post("/check-username", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        available: false,
        reason: "Username is required",
      });
    }

    const normalizedUsername = username.toLowerCase().trim();

    // Basic validation
    if (normalizedUsername.length < 2) {
      return res.status(400).json({
        available: false,
        reason: "Username must be at least 2 characters long",
      });
    }

    if (normalizedUsername.length > 20) {
      return res.status(400).json({
        available: false,
        reason: "Username must be less than 20 characters",
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      return res.status(400).json({
        available: false,
        reason: "Username can only contain letters, numbers, and underscores",
      });
    }

    // Check bloom filter
    const mightExist = bloomFilter.contains(normalizedUsername);

    if (!mightExist) {
      // If bloom filter says it doesn't exist, it definitely doesn't exist
      return res.json({
        available: true,
        reason: "Username is available",
      });
    }

    console.log("⚠️ Username might be taken (in bloom filter) - would check database in real implementation");
    // If bloom filter says it might exist, we would normally check the database
    // For this demo, we'll treat it as taken to show the bloom filter working
    return res.json({
      available: false,
      reason: "Username already exists",
      suggestions: generateSuggestions(normalizedUsername, new Set([normalizedUsername])),
    });
  } catch (error) {
    console.error("Error checking username:", error);
    res.status(500).json({
      available: false,
      reason: "Internal server error",
    });
  }
});

// API endpoint to register username (add to bloom filter)
router.post("/register-username", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    const normalizedUsername = username.toLowerCase().trim();

    // Add to bloom filter
    bloomFilter.add(normalizedUsername);

    res.json({
      success: true,
      message: "Username registered successfully",
    });
  } catch (error) {
    console.error("Error registering username:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "LixBlogs API is running",
    timestamp: new Date().toISOString(),
  });
});

// Helper function to generate username suggestions
function generateSuggestions(baseName, takenSet) {
  const suggestions = [];

  // Add numbers
  for (let i = 1; i <= 99; i++) {
    const suggestion = baseName + i;
    if (!takenSet.has(suggestion) && suggestions.length < 5) {
      suggestions.push(suggestion);
    }
  }

  // Add prefixes
  const prefixes = ["the", "cool", "new", "super", "real"];
  prefixes.forEach((prefix) => {
    const suggestion = prefix + baseName;
    if (!takenSet.has(suggestion) && suggestions.length < 5) {
      suggestions.push(suggestion);
    }
  });

  // Add suffixes
  const suffixes = ["_dev", "_writer", "_blogger", "_pro", "_official"];
  suffixes.forEach((suffix) => {
    const suggestion = baseName + suffix;
    if (!takenSet.has(suggestion) && suggestions.length < 5) {
      suggestions.push(suggestion);
    }
  });

  return suggestions.slice(0, 5);
}

// Add request logging middleware
appExpress.use((req, res, next) => {
  next();
});

// Debug: List all registered routes
console.log("📋 Registered API routes:");
router.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods);
  }
});

// Start server
const PORT = process.env.PORT || 3001;
appExpress.listen(PORT, () => {
  console.log(`🚀 LixBlogs API server running on port ${PORT}`);
  console.log(`📊 Bloom filter ready for username checking`);
});

export default appExpress;
