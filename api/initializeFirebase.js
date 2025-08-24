import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// load service account key
const serviceAccount = JSON.parse(readFileSync('./server.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://photoshare_edc8a-default-rtdb.firebaseio.com"
});

const db = admin.database();
const auth = admin.auth();
const storage = admin.storage();
const firestore = admin.firestore();

export default {
  db,
  auth,
  storage,
  firestore
};