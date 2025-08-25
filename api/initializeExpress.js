import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
const appExpress = express();

appExpress.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ],
  credentials: true
}));

const router = express.Router();
appExpress.use("/api", router);
appExpress.use(cookieParser());
export { appExpress, router };