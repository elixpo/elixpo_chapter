import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyBUEuy0nkv9hOkkH-BTJAi6B9cQxTDmq0s",
  authDomain: "notes-89337.firebaseapp.com",
  databaseURL: "https://notes-89337-default-rtdb.firebaseio.com",
  projectId: "notes-89337",
  storageBucket: "notes-89337.appspot.com",
  messagingSenderId: "739166822032",
  appId: "1:739166822032:web:adafa65bf508eb86460215"
};

const app = initializeApp(firebaseConfig);
export default app;