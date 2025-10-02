import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";

let db, store, collec, auth;

try {
  // Try to load service account key
  if (existsSync("./database.json")) {
    const serviceAccount = JSON.parse(
      readFileSync("./database.json", "utf-8")
    );

    // Initialize Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://photoshare-edc8a-default-rtdb.firebaseio.com/"
    });

    db = admin.database(); 
    store = admin.storage();
    collec = admin.firestore();
    auth = admin.auth();
    
    console.log("✅ Firebase initialized successfully with service account");
  } else {
    console.log("⚠️  database.json not found - Firebase features will be disabled");
    console.log("📝 To enable Firebase:");
    console.log("   1. Get your Firebase service account key from Firebase Console");
    console.log("   2. Save it as 'database.json' in the project root");
    console.log("   3. Restart the server");
    
    // Create mock objects for development
    db = {
      ref: () => ({
        once: () => Promise.resolve({ val: () => null }),
        set: () => Promise.resolve(),
        push: () => Promise.resolve({ key: 'mock-key' }),
        update: () => Promise.resolve()
      })
    };
    
    store = {
      bucket: () => ({
        upload: () => Promise.resolve(),
        file: () => ({
          getSignedUrl: () => Promise.resolve(['mock-url'])
        })
      })
    };
    
    collec = {
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({ exists: false, data: () => null }),
          set: () => Promise.resolve(),
          update: () => Promise.resolve()
        }),
        add: () => Promise.resolve({ id: 'mock-id' })
      })
    };
    
    auth = {
      verifyIdToken: () => Promise.resolve({ uid: 'mock-uid', email: 'mock@example.com' }),
      createUser: () => Promise.resolve({ uid: 'mock-uid' }),
      getUserByEmail: () => Promise.resolve({ uid: 'mock-uid' })
    };
  }
} catch (error) {
  console.error("❌ Firebase initialization failed:", error.message);
  console.log("🔧 Running in development mode without Firebase");
  
  // Fallback mock objects
  db = { ref: () => ({ once: () => Promise.resolve({ val: () => null }) }) };
  store = { bucket: () => ({}) };
  collec = { collection: () => ({}) };
  auth = { verifyIdToken: () => Promise.resolve({ uid: 'dev-uid' }) };
}

export { db, store, collec, auth };