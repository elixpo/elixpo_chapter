import app from './firebaseConfig.js';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function getTodaysNews() {
    const db = getFirestore(app);

    // Get the latestNewsId from genStats/news
    const genStatsRef = collection(db, 'genStats');
    const genStatsSnapshot = await getDocs(genStatsRef);
    let latestNewsId = null;
    genStatsSnapshot.forEach(doc => {
        if (doc.id === "news") {
            const data = doc.data();
            latestNewsId = data.latestNewsId;
        }
    });

    if (!latestNewsId) {
        return null;
    }

    // Get the news document with id latestNewsId
    const newsCol = collection(db, 'news');
    const newsSnapshot = await getDocs(newsCol);
    let latestNews = null;
    newsSnapshot.forEach(doc => {
        if (doc.id === latestNewsId) {
            latestNews = { id: doc.id, ...doc.data() };
        }
    });

    return latestNews;
}

// Example usage:
// (async () => {
//     const todaysNews = await getTodaysNews();
//     console.log(JSON.stringify(todaysNews, null, 2));
// })();



async function getTodaysNewsDetails() {
    const db = getFirestore(app);
    const newsDetailsRef = collection(db, 'genStats');
    const snapshot = await getDocs(newsDetailsRef);
    let newsDetails = null;
    snapshot.forEach(doc => {
        if (doc.id === "news") {
            newsDetails = { id: doc.id, ...doc.data() };
        }
    });
    return newsDetails;
}
export { getTodaysNews, getTodaysNewsDetails };