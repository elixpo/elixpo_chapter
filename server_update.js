import { exec } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import serviceAccount from './elixpoai-firebase-adminsdk-poswc-66a1ef0407.json' assert { type: "json" };

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://elixpoai-default-rtdb.firebaseio.com/'
});

const db = admin.firestore();
const serverJsonPath = path.join(process.cwd(), 'server.json');

// Check if internet is available
const isInternetAvailable = async () => {
    try {
        const response = await fetch('https://www.google.com', { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
};

// Function to start and capture the LocalTunnel URL
const getLocalTunnelUrl = (port) => {
    return new Promise((resolve, reject) => {
        const command = `lt --port ${port}`;
        
        // Execute the lt command to start localtunnel
        exec(command, (error, stdout, stderr) => {
            if (error) {
                return reject(`Error fetching localtunnel URL: ${error.message}`);
            } 
            if (stderr) {
                return reject(`Localtunnel error: ${stderr}`);
            }

            // Strip out the "your url is: " part and return only the URL
            const urlPrefix = "your url is: ";
            const url = stdout.trim().replace(urlPrefix, '').trim();
            resolve(url);
        });
    });
};

// Update the server URLs in server.json and Firebase
const updateServerUrls = async () => {
    // Allow time for LocalTunnel to establish the connection
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        // Get the LocalTunnel URL
        const server1Url = await getLocalTunnelUrl(3001); // Node server

        console.log(`Image and ping URL: ${server1Url}`);

        // Read and update server.json
        const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));
        serverJson.servers.server1 = server1Url;

        // Write the updated server.json file
        fs.writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2));
        console.log('Updated server.json');

        // Update the Firebase collection with the new URLs
        console.log('Updating Firebase collection...');
        const serverRef = db.collection('Server').doc('servers');
        await serverRef.update({
            download_image: server1Url,
            get_ping: server1Url,
        });
        console.log('Firebase collection updated successfully!');
    } catch (error) {
        console.error('Error updating server URLs:', error);
    }
};

// Main function to manage the workflow
const main = async () => {
    console.log('Checking internet connection...');
    let internetAvailable = false;

    // Continuously check for internet availability
    while (!internetAvailable) {
        internetAvailable = await isInternetAvailable();
        if (!internetAvailable) {
            console.log('No internet connection. Retrying in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log('Internet connection established.');
    
    // Update the server URLs when internet is available
    await updateServerUrls();
};

// Run the main function
main();
