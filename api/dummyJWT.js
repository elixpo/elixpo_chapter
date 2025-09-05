// backend.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(cors({
  origin: ["http://127.0.0.1:5500"],
  credentials: true
}));

app.use(cookieParser());

// route to set cookie
app.get("/setCookie", (req, res) => {
  res.cookie("authToken", "dummy-jwt-token", {
    httpOnly: true,
    secure: false,     
    sameSite: "Lax",  
    maxAge: 1000 * 60 * 60 
  });
  res.json({ message: "Cookie set!" });
   
});

// route to check cookie
app.get("/checkAuth", (req, res) => {
  console.log("Cookies received:", req.cookies);
  if (req.cookies?.authToken) {
    return res.json({ authenticated: true, token: req.cookies.authToken });
  }
  res.status(401).json({ authenticated: false });
});

app.listen(5000, "127.0.0.1", () => console.log("Backend running on http://127.0.0.1:5000"));
