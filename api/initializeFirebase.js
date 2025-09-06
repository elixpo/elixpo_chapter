import admin from "firebase-admin";
import { readFileSync } from "fs";


// Load service account key
const serviceAccount = JSON.parse(
  readFileSync("./database.json", "utf-8")
);

// Initialize Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://photoshare-edc8a-default-rtdb.firebaseio.com/"
});

const db = admin.database(); 
const store = admin.storage();
const collec = admin.firestore();
const auth = admin.auth();
export { db, store, collec, auth };