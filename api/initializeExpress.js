import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
const appExpress = express();

appExpress.use(cors({
  origin: [
    "http://localhost:3000",
  ],
  credentials: true,
}));


const router = express.Router();
appExpress.use("/api", router);
appExpress.use(cookieParser());
export { appExpress, router };