import app from './firebaseConfig.js';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
const db = getFirestore(app);

async function getTodaysPodcasts() {
    // Step 1: Get the 'podcast' document from 'genStats'
    const genStatsCol = collection(db, 'genStats');
    const genStatsSnapshot = await getDocs(genStatsCol);
    let latestPodcastID = null;
    genStatsSnapshot.forEach(doc => {
        if (doc.id === "podcast") {
            const data = doc.data();
            latestPodcastID = data.latestPodcastID;
        }
    });

    if (!latestPodcastID) {
        return null;
    }

    // Step 2: Get the podcast document from 'podcasts' collection
    const podcastsCol = collection(db, 'podcasts');
    const podcastsSnapshot = await getDocs(podcastsCol);
    let latestPodcast = null;
    podcastsSnapshot.forEach(doc => {
        if (doc.id === latestPodcastID) {
            latestPodcast = { id: doc.id, ...doc.data() };
        }
    });

    return latestPodcast;
}


async function getTodaysPodcastDetails() 
{
    const podcastDocRef = collection(db, 'genStats');
    const snapshot = await getDocs(podcastDocRef);
    let podcastDetails = null;
    snapshot.forEach(doc => {
        if (doc.id === "podcast") {
            podcastDetails = { id: doc.id, ...doc.data() };
        }
    });
    return podcastDetails;
}


export  {getTodaysPodcasts, getTodaysPodcastDetails};