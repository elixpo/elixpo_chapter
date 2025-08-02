import { initializeApp } from "firebase/app";
import dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.db_api,
  authDomain: "notes-89337.firebaseapp.com",
  databaseURL: "https://notes-89337-default-rtdb.firebaseio.com",
  projectId: "notes-89337",
  storageBucket: "notes-89337.appspot.com",
  messagingSenderId: process.env.db_messaging_id,
  appId: process.env.db_app_id
};

const app = initializeApp(firebaseConfig);
export default app;