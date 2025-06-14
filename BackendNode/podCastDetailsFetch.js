import app from './firebaseConfig.js';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
const db = getFirestore(app);

async function getTodaysPodcasts() {
    const today = new Date().toISOString().split('T')[0];
    const podcastsCol = collection(db, 'podcasts');
    const snapshot = await getDocs(podcastsCol);

    const podcasts = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (
            data.time_generated &&
            data.time_generated.split(' ')[0] === today
        ) {
            podcasts.push({ id: doc.id, ...data });
        }
    });
    return podcasts;
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