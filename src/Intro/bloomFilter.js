// Simple Bloom Filter Client for Username Checking
class BloomFilter {
  // Check name availability using backend API
  async checkNameAvailability(name) {
    try {
      const response = await fetch("http://localhost:3001/api/check-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: name }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          available: false,
          reason: errorData.reason || "Server error",
        };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error checking name availability:", error);
      return {
        available: false,
        reason: "Unable to check availability",
      };
    }
  }
}

// Create global bloom filter instance
window.bloomFilter = new BloomFilter();
