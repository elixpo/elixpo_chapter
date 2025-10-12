import { appExpress, router } from "../initializeExpress.js";
import {registerRequest, verifyRegisterOTP, registerDisplayName} from './apiRegister.js';
import {authenticateToken, loginGithub, loginGoogle, loginEmail, verifyLoginOTP} from './apiLogin.js';
import {checkUsernameRequest } from "./bloomfiltercheck.js";



router.get("/registerRequest", async (req, res) => {
    const email = req.query.email;
    console.log(email);
    await registerRequest(email, req, res);
    
});


router.get("/checkAuth", authenticateToken, (req, res) => {
  res.status(200).json({ 
    authenticated: true, 
    user: { email: req.user.email, uid: req.user.uid } 
  });
});

router.get("/verifyRegisterOTP", async (req, res) => {
    const { otp, token, email, time, callback } = req.query;
    console.log(otp, token, email, time, callback);
    await verifyRegisterOTP(otp, token, email, time, callback, req, res);
});



router.post("/loginGithub", async (req, res) => {
  const { code, state } = req.body;
    await loginGithub(code, state, req, res);
  
});


router.post("/loginGoogle", async (req, res) => {
  const { code, idToken } = req.body;
  // Support both authorization code and idToken flows
  const authData = code || idToken;
  await loginGoogle(authData, req, res);
  
});


router.get("/loginRequest", async (req, res) => {
  const email = req.query.email?.toLowerCase();
  const remember = req.query.remember === "true";
  await loginEmail(email, remember, req, res);
  
});

router.get("/verifyLoginOTP", async (req, res) => {
  const { otp, token, email, time, operation, state, callback, remember } = req.query;
  await verifyLoginOTP(otp, token, email, time, operation, state, callback, remember, req, res);

});


router.post("/logout", (req, res) => {
  res.clearCookie("authToken", { httpOnly: true, secure: false, sameSite: "Lax" });
  res.status(200).json({ message: "✅ Logged out successfully!" });
});


router.post("/checkUsername", async (req, res) => {
  const { username } = req.body;
  await checkUsernameRequest(username, req, res);
});

router.post("/registerDisplayName", async (req, res) => { 
  const { username, uid } = req.body;
  await registerDisplayName(username, uid, req, res);
})


appExpress.listen(5000, "localhost", () => {
  console.log("Server running at http://localhost:5000");
});
