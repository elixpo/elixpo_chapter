import { execSync, exec } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import admin from 'firebase-admin';
import serviceAccount from './elixpoai-firebase-adminsdk-poswc-66a1ef0407.json' assert { type: "json" };

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://elixpoai-default-rtdb.firebaseio.com/'
});

const db = admin.firestore();

const serverJsonPath = path.join(process.cwd(), 'server.json');

const isInternetAvailable = async () => {
    try {
        const response = await fetch('https://www.google.com', { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
};

const getLocalTunnelUrl = (port) => {
    return new Promise((resolve, reject) => {
        const command = `lt --port ${port}`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Error fetching localtunnel URL: ${error.message}`);
            } else if (stderr) {
                reject(`Localtunnel error: ${stderr}`);
            } else {
                // Parse the URL from stdout
                const url = stdout.trim().split('\n').find(line => line.includes('https://'));
                resolve(url);
            }
        });
    });
};

const updateServerUrls = async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const server1Url = await getLocalTunnelUrl(3001); // node

    console.log(`Image and ping URL: ${server1Url}`);

    const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));

    serverJson.servers.server1 = server1Url; // get image and ping

    fs.writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2));

    console.log('Updated server.json');

    console.log('Updating Firebase collection...');
    const serverRef = db.collection('Server').doc('servers');
    await serverRef.update({
        download_image: server1Url,
        get_ping: server1Url,
    });

    console.log('Firebase collection updated successfully!');
};

const main = async () => {
    console.log('Checking internet connection...');
    let internetAvailable = false;

    while (!internetAvailable) {
        internetAvailable = await isInternetAvailable();
        if (!internetAvailable) {
            console.log('No internet connection. Retrying in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log('Internet connection established.');
    await updateServerUrls().catch(error => {
        console.error('Error updating server URLs:', error);
    });
};

main();
