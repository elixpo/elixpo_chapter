export function extractUIDFromCookie(req) {
  try {
    let token = null;
    if (req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/authToken=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) return null;

    const decoded = jwt.verify(token, process.env.secretJWTKEY);
    return decoded.uid;
  } catch (error) {
    console.log("❌ Failed to extract UID from token:", error.message);
    return null;
  }
}