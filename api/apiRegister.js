import { db, collec } from "./initializeFirebase.js";
import { appExpress, router } from "./initializeExpress.js";
import { generateOTP, generatetoken, sendOTPMail, createFirebaseUser, generateUID } from "./utility.js";
import MAX_EXPIRE_TIME from "./config.js";
import { bf2 }  from './bloomFilter.js';




if (require.main === module) {
    checkExistingUserEmail("ayushbhatt633@gmail.com").then((exists) => {
        if(exists)
        {
            console.log("The user exists");
        }
    })
}

// appExpress.listen(5000, "0.0.0.0", () => {
//     console.log("Register server listening on http://0.0.0.0:5000");
// });