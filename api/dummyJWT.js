import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import admin from "firebase-admin";
import {db, collec} from "./initializeFirebase.js";


const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
}));

// Helper to create JWT
function issueJwt(uid, email) {
  return jwt.sign({ uid, email }, "MY_SECRET_KEY", { expiresIn: "2h" });
}

// 🔑 Google Login
app.post("/loginGoogle", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: "Missing idToken" });

  try {
    // 1️⃣ Verify Google ID token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const firebaseUID = decoded.uid;
    const email = decoded.email;

    // 2️⃣ Check Firestore users collection
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).limit(1).get();

    let uid;
    if (snapshot.empty) {
      // 3️⃣ User not found → create in Firestore
      const newUserRef = usersRef.doc(); // custom UID
      uid = newUserRef.id;

      await newUserRef.set({
        uid,
        firebaseUID,
        email,
        name: decoded.name || "",
        photoURL: decoded.picture || "",
        joinedVia: "google",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("🆕 New user created:", email);
    } else {
      // 4️⃣ User exists
      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();
      uid = userData.uid || userDoc.id;

      console.log("✅ Existing user logged in:", email);
    }

    // 5️⃣ Issue or refresh JWT
    const token = issueJwt(uid, email);

    // 6️⃣ Set cookie
    res.cookie("authToken", token, {
      httpOnly: true,
      secure: false,   // ⚠️ use true in production
      sameSite: "Lax",
      maxAge: 2 * 60 * 60 * 1000, // 2h
    });

    return res.json({ status: true, message: "Google login successful", user: { uid, email } });

  } catch (err) {
    console.error("❌ Token verify failed:", err.message);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Protected route example
app.get("/me", (req, res) => {
  const token = req.cookies.authToken;
  if (!token) return res.status(401).json({ error: "No auth token" });

  try {
    const decoded = jwt.verify(token, "MY_SECRET_KEY");
    res.json({ status: true, user: decoded });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

app.listen(5000, "localhost", () => console.log("🚀 Backend running at http://localhost:5000"));
