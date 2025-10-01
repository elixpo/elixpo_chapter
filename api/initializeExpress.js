import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const appExpress = express();

// Middleware order is important
appExpress.use(cookieParser());
appExpress.use(express.json());
appExpress.use(express.urlencoded({ extended: true }));

appExpress.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    credentials: true,
  })
);

const router = express.Router();
appExpress.use("/api", router);

export { appExpress, router };
