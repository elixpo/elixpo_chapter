import { exec } from 'child_process';
import fetch from 'node-fetch';


const isInternetAvailable = async () => {
    try {
        const response = await fetch('https://www.google.com', { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
};


const startTunnel = () => {

    const playItService = `bash /home/pi/tunnel.sh`;
    const tunnelStart = `bash /home/pi/Desktop/Elixpo_ai_pollinations/server.sh`;
    exec(tunnelStart, (error) => {
        if (error) {
            console.error(`Error starting ngrok tunnel script: ${error.message}`);
        }
    });
    exec(playItService, (error) => {
        if (error) {
            console.error(`Error starting ngrok tunnel script: ${error.message}`);
        }
    });
}


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
    startTunnel();
};

main();